from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.schemas.dashboard import DashboardStats
from app.security import verify_token

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(verify_token)])


@router.get("/stats", response_model=DashboardStats)
async def get_stats(db: AsyncSession = Depends(get_db)):
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Weekly conversations
    result = await db.execute(
        select(func.count(Conversation.id))
        .where(Conversation.created_at >= week_ago)
    )
    weekly_conversations = result.scalar() or 0

    # Comment triggers this week
    result = await db.execute(
        select(func.count(Conversation.id))
        .where(
            Conversation.created_at >= week_ago,
            Conversation.trigger_source == "comment_rule",
        )
    )
    comment_triggers = result.scalar() or 0

    # AI resolution rate: conversations where last message is from assistant (AI)
    # and user hasn't replied for 24+ hours — meaning AI resolved the issue
    day_ago = datetime.now(timezone.utc) - timedelta(hours=24)
    result = await db.execute(
        select(func.count(Conversation.id))
        .where(
            Conversation.created_at >= week_ago,
            Conversation.mode == "ai",
            Conversation.updated_at < day_ago,
        )
    )
    stale_ai_convs = result.scalar() or 0

    # Among those, count ones where the last message is from assistant
    # (user didn't come back after AI reply = resolved)
    resolved = 0
    if stale_ai_convs > 0:
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Conversation)
            .where(
                Conversation.created_at >= week_ago,
                Conversation.mode == "ai",
                Conversation.updated_at < day_ago,
            )
            .options(selectinload(Conversation.messages))
        )
        for conv in result.scalars().all():
            msgs = [m for m in conv.messages if m.role in ("user", "assistant")]
            if msgs and msgs[-1].role == "assistant":
                resolved += 1

    ai_rate = (resolved / weekly_conversations * 100) if weekly_conversations > 0 else 0

    return DashboardStats(
        weekly_conversations=weekly_conversations,
        ai_resolution_rate=round(ai_rate, 1),
        comment_triggers=comment_triggers,
    )
