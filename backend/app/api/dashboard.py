from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.conversation import Conversation, Message
from app.schemas.dashboard import DashboardStats

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


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

    # AI resolution rate: conversations where AI replied and user didn't send another message
    result = await db.execute(
        select(func.count(Conversation.id))
        .where(Conversation.created_at >= week_ago, Conversation.is_resolved == True)
    )
    resolved = result.scalar() or 0
    ai_rate = (resolved / weekly_conversations * 100) if weekly_conversations > 0 else 0

    return DashboardStats(
        weekly_conversations=weekly_conversations,
        ai_resolution_rate=round(ai_rate, 1),
        comment_triggers=comment_triggers,
    )
