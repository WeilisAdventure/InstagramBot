from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.services.comment_trigger import find_matching_rule, render_template
from app.schemas.settings import SimulateRequest, SimulateResponse

router = APIRouter(prefix="/api/simulate", tags=["simulate"])


@router.post("", response_model=SimulateResponse)
async def simulate_comment(data: SimulateRequest, db: AsyncSession = Depends(get_db)):
    rule = await find_matching_rule(db, data.comment_text)
    if not rule:
        return SimulateResponse(triggered=False)

    public_reply = render_template(rule.public_reply_template, name=data.username) if rule.public_reply_template else None
    dm_content = render_template(rule.dm_template, name=data.username) if rule.dm_template else None

    # Create simulation conversation
    conv = Conversation(
        ig_user_id="simulation",
        ig_username=data.username,
        trigger_source="simulation",
        trigger_rule_id=rule.id,
        mode=rule.follow_up_mode,
    )
    db.add(conv)
    await db.flush()

    system_msg = Message(
        conversation_id=conv.id,
        role="system",
        content=f"[Simulation] Comment: \"{data.comment_text}\" matched rule '{rule.name}'",
    )
    db.add(system_msg)

    if dm_content:
        dm_msg = Message(
            conversation_id=conv.id,
            role="assistant",
            content=dm_content,
            is_ai_generated=False,
        )
        db.add(dm_msg)

    await db.commit()

    return SimulateResponse(
        triggered=True,
        matched_rule=rule.name,
        public_reply=public_reply,
        dm_content=dm_content,
        conversation_id=conv.id,
    )
