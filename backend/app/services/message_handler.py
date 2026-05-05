import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.conversation import Conversation, Message
from app.models.settings import SystemSettings
from app.instagram.base import IncomingMessage, IncomingComment, InstagramClient
from app.ai.base import AIProvider
from app.services.comment_trigger import find_matching_rule, render_template
from app.database import async_session

logger = logging.getLogger(__name__)


class MessageHandler:
    def __init__(self, ai: AIProvider, ig: InstagramClient, reply_delay: int = 3):
        self.ai = ai
        self.ig = ig
        self.reply_delay = reply_delay

    async def _get_setting_value(self, key: str, default: str = "") -> str:
        """Read a setting value from DB at runtime."""
        async with async_session() as db:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == key)
            )
            setting = result.scalar_one_or_none()
            return setting.value if setting else default

    async def _is_enabled(self, key: str) -> bool:
        async with async_session() as db:
            result = await db.execute(
                select(SystemSettings).where(SystemSettings.key == key)
            )
            setting = result.scalar_one_or_none()
            if setting is None:
                return True  # enabled by default
            return setting.value.lower() in ("true", "1", "yes")

    async def _get_or_create_conversation(
        self, db: AsyncSession, sender_id: str, username: str,
        trigger_source: str = "direct_dm", rule_id: int | None = None,
        mode: str | None = None,
    ) -> tuple[Conversation, bool]:
        """Returns (conversation, is_new)."""
        result = await db.execute(
            select(Conversation)
            .where(Conversation.ig_user_id == sender_id, Conversation.is_resolved == False)
            .order_by(Conversation.created_at.desc())
        )
        conv = result.scalar_one_or_none()
        if conv:
            return conv, False
        # Default new-conv mode comes from the system setting if caller didn't pin one
        if mode is None:
            default_mode = await self._get_setting_value("default_conversation_mode", "ai")
            mode = default_mode if default_mode in ("ai", "human") else "ai"
        conv = Conversation(
            ig_user_id=sender_id,
            ig_username=username,
            trigger_source=trigger_source,
            trigger_rule_id=rule_id,
            mode=mode,
        )
        db.add(conv)
        await db.flush()
        return conv, True

    async def _get_conversation_history(self, db: AsyncSession, conv_id: int, limit: int = 10) -> list[dict]:
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv_id)
            .order_by(Message.created_at.desc())
            .limit(limit)
        )
        messages = list(reversed(result.scalars().all()))
        return [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant") and m.content and m.content.strip()]

    async def handle_dm(self, msg: IncomingMessage):
        """Handle an incoming direct message."""
        auto_reply_on = await self._is_enabled("auto_reply_enabled")

        # If username is empty (webhook mode), try to fetch it via Graph API
        username = msg.sender_username
        profile_pic = None
        if hasattr(self.ig, 'get_user_profile'):
            try:
                profile = await self.ig.get_user_profile(msg.sender_id)
                if profile:
                    if not username:
                        username = profile.get("username", "") or profile.get("name", "")
                    profile_pic = profile.get("profile_pic") or profile.get("profile_picture_url")
            except Exception as e:
                logger.warning(f"Could not fetch profile for {msg.sender_id}: {e}")

        # Phase 1: Save user message immediately so frontend can see it
        async with async_session() as db:
            conv, is_new = await self._get_or_create_conversation(
                db, msg.sender_id, username
            )
            if username and not conv.ig_username:
                conv.ig_username = username
            if profile_pic:
                conv.ig_profile_pic = profile_pic
            user_msg = Message(
                conversation_id=conv.id,
                role="user",
                content=msg.text or "",
            )
            db.add(user_msg)
            conv.updated_at = datetime.now(timezone.utc)
            await db.commit()
            conv_id = conv.id
            conv_mode = conv.mode

        # Phase 1.5: Send welcome message to new users
        if is_new:
            welcome_enabled = await self._is_enabled("welcome_message_enabled")
            if welcome_enabled:
                welcome_text = await self._get_setting_value("welcome_message_text", "")
                if welcome_text.strip():
                    success = await self.ig.send_dm(msg.sender_id, welcome_text)
                    async with async_session() as db:
                        db.add(Message(
                            conversation_id=conv_id,
                            role="assistant",
                            content=welcome_text,
                            is_ai_generated=False,
                        ))
                        conv = await db.get(Conversation, conv_id)
                        if conv:
                            conv.updated_at = datetime.now(timezone.utc)
                        await db.commit()
                    if success:
                        logger.info(f"Sent welcome message to new user {msg.sender_id}")
                    else:
                        logger.warning(f"Failed to send welcome message to {msg.sender_id}")

        # AI auto-reply requires BOTH the global switch ON AND this conv in "ai" mode.
        # Global OFF = bot fully muted; conv mode "human" = manager handles this one.
        if not auto_reply_on:
            logger.info("Global auto-reply disabled, message saved only")
            return
        if conv_mode != "ai":
            logger.info(f"Conversation {conv_id} is in human mode, skipping AI reply")
            return

        # Phase 2: Generate and send AI reply
        # Always rebuild provider from latest DB settings so model/key
        # changes take effect immediately without restarting the service.
        from app.ai.factory import create_provider_for_model
        from app.config import settings as app_settings

        current_model  = await self._get_setting_value("ai_model", "claude-sonnet-4-20250514")
        model_provider = await self._get_setting_value("ai_model_provider", "")
        a_key  = (await self._get_setting_value("anthropic_api_key", "")) or app_settings.anthropic_api_key
        o_key  = (await self._get_setting_value("openai_api_key", ""))    or app_settings.openai_api_key
        g_key  = (await self._get_setting_value("google_api_key", ""))    or app_settings.google_api_key
        custom_key = await self._get_setting_value("custom_api_key", "")
        custom_url = await self._get_setting_value("custom_base_url", "")

        self.ai = create_provider_for_model(
            model_id=current_model,
            anthropic_key=a_key,
            openai_key=o_key,
            openai_base_url=app_settings.openai_base_url,
            google_key=g_key,
            provider_override=model_provider,
            custom_api_key=custom_key,
            custom_base_url=custom_url,
        )

        async with async_session() as db:
            history = await self._get_conversation_history(db, conv_id)
            from app.models.preference import ManagerPreference
            pref_q = await db.execute(
                select(ManagerPreference).where(ManagerPreference.is_active == True)
            )
            preferences = [p.content for p in pref_q.scalars().all()]

        # Knowledge now lives entirely in markdown sections routed by intent
        # inside build_system_prompt; no DB Q&A filter needed. History is
        # passed so short follow-ups ("yes", "M4W") inherit the topic.
        self.ai.reload_knowledge(
            preferences=preferences,
            user_message=msg.text or "",
            history=history,
        )

        # First-message detection: history excluding the just-saved user msg
        prior = [m for m in history if not (m["role"] == "user" and m["content"] == (msg.text or ""))]
        is_first = len(prior) == 0

        from app.ai.prompt import build_reply_directive
        auto_extra = build_reply_directive(is_first=is_first, for_draft=False)

        try:
            reply_text = await self.ai.generate_reply(msg.text or "", history, extra_prompt=auto_extra)
        except Exception as e:
            logger.error(f"AI reply failed: {e}")
            async with async_session() as db:
                db.add(Message(
                    conversation_id=conv_id, role="system",
                    content=f"[AI_ERROR] {str(e)[:200]}"
                ))
                conv = await db.get(Conversation, conv_id)
                if conv:
                    conv.updated_at = datetime.now(timezone.utc)
                await db.commit()
            return

        # Check if AI cannot answer (knowledge insufficient)
        if "__CANNOT_ANSWER__" in reply_text:
            logger.info(f"AI cannot answer question from {msg.sender_username}: {msg.text}")
            async with async_session() as db:
                db.add(Message(
                    conversation_id=conv_id, role="system",
                    content=f"[CANNOT_ANSWER] {msg.text or ''}"
                ))
                conv = await db.get(Conversation, conv_id)
                if conv:
                    conv.updated_at = datetime.now(timezone.utc)
                await db.commit()
            return

        # Apply translation strategy before sending
        strategy = await self._get_setting_value("translation_strategy", "auto")
        if strategy in ("always", "auto"):
            import re
            reply_has_cjk = bool(re.search(r"[\u4e00-\u9fff\u3400-\u4dbf]", reply_text))
            should_translate = strategy == "always"
            if strategy == "auto":
                customer_has_cjk = bool(re.search(r"[\u4e00-\u9fff\u3400-\u4dbf]", msg.text or ""))
                should_translate = reply_has_cjk != customer_has_cjk
            if should_translate:
                try:
                    tr_result = await self.ai.translate_message(reply_text)
                    original_reply = reply_text
                    reply_text = tr_result["translated"]
                    logger.info(f"Translation applied ({strategy}): {original_reply[:50]}... → {reply_text[:50]}...")
                except Exception as e:
                    logger.warning(f"Translation failed, sending original reply: {e}")

        # Simulate typing delay (read from DB)
        delay = int(await self._get_setting_value("reply_delay_seconds", "3"))
        if delay > 0:
            await asyncio.sleep(delay)

        # Send reply
        success = await self.ig.send_dm(msg.sender_id, reply_text)

        # Phase 3: Save assistant message
        async with async_session() as db:
            assistant_msg = Message(
                conversation_id=conv_id,
                role="assistant",
                content=reply_text,
                is_ai_generated=True,
            )
            db.add(assistant_msg)
            conv = await db.get(Conversation, conv_id)
            if conv:
                conv.updated_at = datetime.now(timezone.utc)
            await db.commit()

            if success:
                logger.info(f"Replied to DM from {msg.sender_username}")
            else:
                logger.error(f"Failed to send DM reply to {msg.sender_username}")

    async def handle_comment(self, comment: IncomingComment):
        """Handle an incoming comment: log the event then optionally trigger.

        Every comment is recorded in `comment_events` so the manager has
        visibility even when comment-trigger is disabled. The auto-action
        (public reply + DM + conversation creation) only runs when the
        global toggle is on AND a rule matches.
        """
        from app.models.comment_event import CommentEvent
        from sqlalchemy.exc import IntegrityError

        trigger_on = await self._is_enabled("comment_trigger_enabled")

        async with async_session() as db:
            rule = None
            if trigger_on:
                rule = await find_matching_rule(db, comment.text)

            if not trigger_on:
                action = "skipped_disabled"
            elif rule is None:
                action = "no_match"
            else:
                action = "auto_replied"

            event = CommentEvent(
                comment_id=comment.comment_id,
                media_id=comment.media_id or "",
                user_id=comment.user_id or "",
                username=comment.username or "",
                text=comment.text or "",
                matched_rule_id=rule.id if rule else None,
                action_taken=action,
                is_read=False,
            )
            db.add(event)
            try:
                await db.commit()
                await db.refresh(event)
                event_id = event.id
            except IntegrityError:
                # Duplicate webhook delivery for the same comment_id — skip silently.
                await db.rollback()
                logger.info(f"Duplicate comment event for {comment.comment_id}, skipping")
                return

        # Fire-and-forget: fetch the post permalink in the background so the
        # inbox can link straight to the IG post. Non-blocking; failures are
        # logged inside the helper.
        if event_id and comment.media_id and hasattr(self.ig, "get_media_permalink"):
            asyncio.create_task(self._enrich_event_permalink(event_id, comment.media_id))

        if not trigger_on:
            logger.info("Comment trigger disabled, event logged only")
            return

        async with async_session() as db:
            # Belt-and-suspenders: re-read the toggle right before any auto-action
            # so a toggle flipped between log-time and act-time still wins.
            if not await self._is_enabled("comment_trigger_enabled"):
                logger.info(
                    f"Comment trigger toggled off mid-handler, aborting auto-action "
                    f"for comment {comment.comment_id}"
                )
                return

            rule = await find_matching_rule(db, comment.text)
            if not rule:
                return

            logger.info(
                f"Comment trigger ACTING: rule='{rule.name}' on comment from "
                f"@{comment.username} (comment_id={comment.comment_id})"
            )

            # Public reply to the comment
            if rule.public_reply_template:
                public_text = render_template(
                    rule.public_reply_template, name=comment.username
                )
                await self.ig.reply_to_comment(
                    comment.media_id, comment.comment_id, public_text
                )

            # Send DM
            if rule.dm_template:
                dm_text = render_template(rule.dm_template, name=comment.username)
                await self.ig.send_dm(comment.user_id, dm_text)

            # Create or update conversation with trigger info
            mode = rule.follow_up_mode  # "ai" or "human"
            conv, _ = await self._get_or_create_conversation(
                db, comment.user_id, comment.username,
                trigger_source="comment_rule",
                rule_id=rule.id,
                mode=mode,
            )
            # Ensure trigger info is set even if conversation was reused
            conv.trigger_source = "comment_rule"
            conv.trigger_rule_id = rule.id
            system_msg = Message(
                conversation_id=conv.id,
                role="system",
                content=f"Triggered by comment rule '{rule.name}': \"{comment.text}\"",
            )
            db.add(system_msg)

            if rule.dm_template:
                dm_text = render_template(rule.dm_template, name=comment.username)
                assistant_msg = Message(
                    conversation_id=conv.id,
                    role="assistant",
                    content=dm_text,
                    is_ai_generated=False,
                )
                db.add(assistant_msg)

            await db.commit()

    async def _enrich_event_permalink(self, event_id: int, media_id: str):
        """Fetch the post permalink via Graph API and persist it on the event."""
        try:
            permalink = await self.ig.get_media_permalink(media_id)
        except Exception as e:
            logger.warning(f"Permalink fetch failed for media {media_id}: {e}")
            return
        if not permalink:
            return
        from app.models.comment_event import CommentEvent
        async with async_session() as db:
            ev = await db.get(CommentEvent, event_id)
            if ev is not None:
                ev.permalink = permalink
                await db.commit()
