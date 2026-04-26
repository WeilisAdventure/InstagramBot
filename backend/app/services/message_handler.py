import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.conversation import Conversation, Message
from app.models.knowledge import KnowledgeEntry
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
        mode: str = "ai",
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

    async def _load_knowledge_entries(self, db: AsyncSession) -> list[dict]:
        result = await db.execute(
            select(KnowledgeEntry).where(KnowledgeEntry.is_active == True)
        )
        entries = result.scalars().all()
        return [{"question": e.question, "answer": e.answer} for e in entries]

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

        if auto_reply_on:
            # Global ON → auto reply all conversations, ignore per-conversation mode
            pass
        else:
            # Global OFF → per-conversation mode decides
            if conv_mode != "ai":
                logger.info(f"Conversation {conv_id} is in human mode, skipping AI reply")
                return
            # conv_mode == "ai" but global off → no auto reply, user triggers manually in UI
            logger.info("Global auto-reply disabled, message saved only")
            return

        # Phase 2: Generate and send AI reply in a new session
        # Switch provider if model changed to a different vendor
        current_model = await self._get_setting_value("ai_model", "claude-sonnet-4-20250514")
        model_provider = await self._get_setting_value("ai_model_provider", "")
        from app.ai.factory import get_provider_for_model, create_provider_for_model
        from app.config import settings as app_settings
        current_provider = get_provider_for_model(current_model, model_provider)
        ai_provider_type = get_provider_for_model(getattr(self.ai, 'model', ''))
        if current_provider != ai_provider_type:
            custom_key = await self._get_setting_value("custom_api_key", "")
            custom_url = await self._get_setting_value("custom_base_url", "")
            self.ai = create_provider_for_model(
                model_id=current_model,
                anthropic_key=app_settings.anthropic_api_key,
                openai_key=app_settings.openai_api_key,
                openai_base_url=app_settings.openai_base_url,
                google_key=app_settings.google_api_key,
                provider_override=model_provider,
                custom_api_key=custom_key,
                custom_base_url=custom_url,
            )
            logger.info(f"Switched AI provider to {current_provider} ({current_model})")
        else:
            self.ai.model = current_model

        async with async_session() as db:
            knowledge = await self._load_knowledge_entries(db)
            history = await self._get_conversation_history(db, conv_id)

        # Filter knowledge to most relevant entries to stay under token limits
        from app.knowledge.relevance import filter_relevant
        filtered = await filter_relevant(knowledge, msg.text or "", ai=self.ai)
        self.ai.reload_knowledge(filtered)

        # First-message detection: history excluding the just-saved user msg
        prior = [m for m in history if not (m["role"] == "user" and m["content"] == (msg.text or ""))]
        first_extra: str | None = None
        if len(prior) == 0:
            first_extra = (
                "This is the customer's FIRST message. You MUST start your reply by "
                "briefly introducing yourself as Achilles Chen (A.C.), Manager at "
                "FleetNow Delivery, then ask whether they need personal or business "
                "delivery (pricing differs by volume), and emphasize our unlimited-"
                "distance same-day flat-rate service."
            )

        try:
            reply_text = await self.ai.generate_reply(msg.text or "", history, extra_prompt=first_extra)
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
        """Handle an incoming comment: check trigger rules and act."""
        if not await self._is_enabled("comment_trigger_enabled"):
            logger.info("Comment trigger disabled, skipping")
            return

        async with async_session() as db:
            rule = await find_matching_rule(db, comment.text)
            if not rule:
                return

            logger.info(f"Comment from @{comment.username} matched rule '{rule.name}'")

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
