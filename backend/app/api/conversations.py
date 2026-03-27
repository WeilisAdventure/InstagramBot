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


@router.post("/{conv_id}/send", response_model=MessageResponse)
async def send_message(conv_id: int, data: SendMessageRequest, request: Request, db: AsyncSession = Depends(get_db)):
    conv = await db.get(Conversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")

    ig_client = request.app.state.ig_client
    success = await ig_client.send_dm(conv.ig_user_id, data.text)
    if not success:
        raise HTTPException(500, "Failed to send message")

    msg = Message(
        conversation_id=conv_id,
        role="assistant",
        content=data.text,
        is_ai_generated=False,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return msg


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
    history = [{"role": m.role, "content": m.content} for m in messages]

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
