from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.schemas.conversation import (
    ConversationResponse, ConversationDetail, MessageResponse,
    SendMessageRequest, AssistRequest, AssistResponse, UpdateModeRequest,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationResponse])
async def list_conversations(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Conversation).order_by(Conversation.updated_at.desc())
    )
    convs = result.scalars().all()
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
    conv.mode = data.mode
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

    if strategy == "always":
        try:
            ai = request.app.state.ai_provider
            tr_result = await ai.translate_message(send_text)
            send_text = tr_result["translated"]
        except Exception:
            pass  # Send original if translation fails
    # "auto" / "never" = send as-is for manual messages

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


@router.post("/{conv_id}/generate-reply")
async def generate_reply(conv_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate an AI reply preview without sending it."""
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    # Load messages
    msg_result = await db.execute(
        select(Message).where(Message.conversation_id == conv_id).order_by(Message.created_at)
    )
    messages = msg_result.scalars().all()
    history = [{"role": m.role, "content": m.content} for m in messages if m.role in ("user", "assistant") and m.content and m.content.strip()]

    # Load knowledge
    from app.models.knowledge import KnowledgeEntry
    k_result = await db.execute(select(KnowledgeEntry).where(KnowledgeEntry.is_active == True))
    entries = k_result.scalars().all()
    knowledge = [{"question": e.question, "answer": e.answer} for e in entries]

    ai = request.app.state.ai_provider
    ai.reload_knowledge(knowledge)

    # Get last user message
    last_user_msg = ""
    for m in reversed(messages):
        if m.role == "user":
            last_user_msg = m.content
            break

    reply = await ai.generate_reply(last_user_msg, history)
    return {"reply": reply}
