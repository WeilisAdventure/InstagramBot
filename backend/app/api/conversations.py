from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.schemas.conversation import (
    ConversationResponse, ConversationDetail, MessageResponse,
    SendMessageRequest, AssistRequest, AssistResponse, UpdateModeRequest,
)
from app.security import verify_token

router = APIRouter(prefix="/api/conversations", tags=["conversations"], dependencies=[Depends(verify_token)])


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(request: Request, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()

    # Lazy-load missing profile pics / usernames via IG API
    ig_client = getattr(request.app.state, "ig_client", None)
    if ig_client and hasattr(ig_client, "get_user_profile"):
        for conv in convs:
            if conv.ig_user_id and (not conv.ig_profile_pic or not conv.ig_username):
                try:
                    profile = await ig_client.get_user_profile(conv.ig_user_id)
                    if profile:
                        if not conv.ig_username and profile.get("username"):
                            conv.ig_username = profile["username"]
                        if not conv.ig_profile_pic and profile.get("profile_pic"):
                            conv.ig_profile_pic = profile["profile_pic"]
                except Exception:
                    pass
        await db.commit()

    response = []
    for conv in convs:
        # Get last message
        msg_result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = msg_result.scalar_one_or_none()
        data = ConversationResponse.model_validate(conv)
        data.last_message = last_msg.content if last_msg else None
        data.last_message_role = last_msg.role if last_msg else None
        data.last_message_is_ai = last_msg.is_ai_generated if last_msg else None
        response.append(data)
    return response


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(conv_id: int, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    msg_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conv_id)
        .order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()
    conv_data = {
        "id": conv.id,
        "ig_user_id": conv.ig_user_id,
        "ig_username": conv.ig_username,
        "ig_profile_pic": conv.ig_profile_pic,
        "trigger_source": conv.trigger_source,
        "trigger_rule_id": conv.trigger_rule_id,
        "mode": conv.mode,
        "is_resolved": conv.is_resolved,
        "created_at": conv.created_at,
        "updated_at": conv.updated_at,
        "messages": [MessageResponse.model_validate(m) for m in messages],
    }
    return ConversationDetail(**conv_data)


@router.patch("/{conv_id}/mode")
async def update_mode(conv_id: int, data: UpdateModeRequest, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    original_updated_at = conv.updated_at
    conv.mode = data.mode
    await db.flush()
    # Restore updated_at so mode change alone doesn't reorder the list
    conv.updated_at = original_updated_at
    await db.commit()
    return {"ok": True, "mode": conv.mode}


@router.post("/{conv_id}/send")
async def send_message(conv_id: int, data: SendMessageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # Apply translation strategy before sending
    send_text = data.text
    from app.models.settings import SystemSettings
    strategy_result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == "translation_strategy")
    )
    strategy_setting = strategy_result.scalar_one_or_none()
    strategy = strategy_setting.value if strategy_setting else "auto"

    if strategy in ("always", "auto"):
        import re
        reply_has_cjk = bool(re.search(r"[\u4e00-\u9fff\u3400-\u4dbf]", send_text))
        should_translate = strategy == "always"
        if strategy == "auto":
            # Detect customer language from their last user message in this conv
            last_user_q = await db.execute(
                select(Message)
                .where(Message.conversation_id == conv_id, Message.role == "user")
                .order_by(Message.created_at.desc())
                .limit(1)
            )
            last_user = last_user_q.scalar_one_or_none()
            customer_has_cjk = bool(
                last_user and re.search(r"[\u4e00-\u9fff\u3400-\u4dbf]", last_user.content or "")
            )
            # Translate when reply language differs from customer language
            should_translate = reply_has_cjk != customer_has_cjk
        if should_translate:
            try:
                ai = request.app.state.ai_provider
                tr_result = await ai.translate_message(send_text)
                send_text = tr_result["translated"]
            except Exception:
                pass  # Send original if translation fails
    # "never" = send as-is

    # Try to send via Instagram, but save message regardless
    ig_client = request.app.state.ig_client
    ig_sent = False
    ig_error = ""
    try:
        ig_sent = await ig_client.send_dm(conv.ig_user_id, send_text)
    except Exception as e:
        ig_error = str(e)

    # Always save the message to DB
    msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=send_text,
        is_ai_generated=data.is_ai_generated if hasattr(data, 'is_ai_generated') else False,
    )
    db.add(msg)
    conv.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)

    result = MessageResponse.model_validate(msg)
    return {
        **result.model_dump(),
        "ig_sent": ig_sent,
        "ig_error": ig_error if not ig_sent else "",
    }


@router.post("/{conv_id}/assist", response_model=AssistResponse)
async def assist_input(conv_id: int, data: AssistRequest, request: Request):
    translator = request.app.state.translator
    result = await translator.assist_input(data.text)
    return AssistResponse(**result)


@router.post("/{conv_id}/translate")
async def translate_message(conv_id: int, data: dict, request: Request):
    """Translate a message text."""
    translator = request.app.state.translator
    result = await translator.translate_message(data.get("text", ""))
    return result


class GenerateReplyRequest(BaseModel):
    prompt: str = ""

@router.post("/{conv_id}/generate-reply")
async def generate_reply(conv_id: int, data: GenerateReplyRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate an AI reply preview without sending it."""
    extra_prompt = data.prompt
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # Load messages
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant") and m.content and m.content.strip()]

    ai = request.app.state.ai_provider
    # Sync model with current setting
    from app.models.settings import SystemSettings
    model_result = await db.execute(select(SystemSettings).where(SystemSettings.key == "ai_model"))
    model_setting = model_result.scalar_one_or_none()
    if model_setting:
        from app.ai.factory import get_provider_for_model, create_provider_for_model
        from app.config import settings as app_settings
        current_model = model_setting.value
        provider_result = await db.execute(select(SystemSettings).where(SystemSettings.key == "ai_model_provider"))
        provider_setting = provider_result.scalar_one_or_none()
        model_provider = provider_setting.value if provider_setting else ""
        if get_provider_for_model(current_model, model_provider) != get_provider_for_model(getattr(ai, 'model', '')):
            ck = await db.execute(select(SystemSettings).where(SystemSettings.key == "custom_api_key"))
            cu = await db.execute(select(SystemSettings).where(SystemSettings.key == "custom_base_url"))
            ck_s, cu_s = ck.scalar_one_or_none(), cu.scalar_one_or_none()
            custom_key = ck_s.value if ck_s else ""
            custom_url = cu_s.value if cu_s else ""
            ai = create_provider_for_model(
                model_id=current_model,
                anthropic_key=app_settings.anthropic_api_key,
                openai_key=app_settings.openai_api_key,
                openai_base_url=app_settings.openai_base_url,
                google_key=app_settings.google_api_key,
                provider_override=model_provider,
                custom_api_key=custom_key,
                custom_base_url=custom_url,
            )
            request.app.state.ai_provider = ai
        else:
            ai.model = current_model
    # Get last user message
    last_user_msg = ""
    for m in reversed(messages):
        if m.role == "user":
            last_user_msg = m.content
            break

    # Load active manager preferences (style rules learnt from past prompts)
    from app.models.preference import ManagerPreference
    pref_result = await db.execute(
        select(ManagerPreference).where(ManagerPreference.is_active == True)
    )
    preferences = [p.content for p in pref_result.scalars().all()]

    # Knowledge now lives entirely in markdown sections routed by intent
    # inside build_system_prompt; no DB Q&A filter needed. History is
    # passed so short follow-ups ("yes", "M4W") inherit the topic.
    ai.reload_knowledge(
        preferences=preferences,
        user_message=last_user_msg,
        history=history,
    )

    # First-message detection: history excluding the current user msg is empty
    prior = [m for m in history if not (m["role"] == "user" and m["content"] == last_user_msg)]
    is_first = len(prior) == 0

    # Manual generate-reply ALWAYS produces a Chinese draft for manager review.
    # Translation to the customer's language happens at send time per
    # translation_strategy setting (see /send endpoint).
    draft_directive = (
        "OUTPUT LANGUAGE OVERRIDE: Reply in Simplified Chinese (中文) ONLY. "
        "This is a draft that the manager will review before sending; do NOT "
        "include any English text in your reply. The system will translate "
        "to the customer's language separately when the manager sends it."
    )
    final_extra = draft_directive
    if is_first:
        final_extra += (
            "\n\n这是客户的第一条消息。回复必须以自我介绍开头：你是 Achilles Chen "
            "(A.C.)，FleetNow Delivery 的 Manager。然后询问对方是个人还是商家配送"
            "（价格按月单量不同），并强调我们的同城无距离限制同日达统一价服务。"
        )
    else:
        final_extra += (
            "\n\n这是后续消息（不是首次）。**严禁重复 conversation history 里你已经"
            "说过的内容**：\n"
            "- 不要再自我介绍\n"
            "- 不要再罗列已提到的优势（包括但不限于：统一费率、同日达、无距离限制、专业服务）。"
            "如果历史里已经出现过 bullet 列表的优势条目（任何语言版本），本条回复**绝对不能"
            "再写第二个 bullet 列表的优势**，改用普通句子简短回应即可。\n"
            "- 不要再问已经问过的限定问题\n"
            "仔细看历史记录，仅针对客户的最新消息作出回应或推进对话。"
        )
    if extra_prompt:
        final_extra += f"\n\n{extra_prompt}"

    reply = await ai.generate_reply(last_user_msg, history, extra_prompt=final_extra)

    # Fire-and-forget: distill long-term preferences from this prompt hint
    if extra_prompt and extra_prompt.strip():
        import asyncio
        from app.services.preference_learner import learn_from_prompt
        asyncio.create_task(learn_from_prompt(ai, extra_prompt.strip()))

    return {"reply": reply}
