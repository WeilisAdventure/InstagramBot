"""Comment-event inbox API.

Surfaces every incoming Instagram comment that the bot saw — including
those skipped because comment-trigger was disabled or no rule matched —
so the manager always has visibility.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.comment_event import CommentEvent
from app.schemas.comment_event import CommentEventListResponse, CommentEventResponse
from app.security import verify_token

router = APIRouter(
    prefix="/api/comments",
    tags=["comments"],
    dependencies=[Depends(verify_token)],
)


@router.get("", response_model=CommentEventListResponse)
async def list_comment_events(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    unread_only: bool = False,
    db: AsyncSession = Depends(get_db),
):
    base = select(CommentEvent)
    if unread_only:
        base = base.where(CommentEvent.is_read == False)
    base = base.order_by(CommentEvent.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(base)
    items = result.scalars().all()

    unread_q = await db.execute(
        select(func.count()).select_from(CommentEvent).where(CommentEvent.is_read == False)
    )
    unread_count = unread_q.scalar() or 0

    total_q = await db.execute(select(func.count()).select_from(CommentEvent))
    total = total_q.scalar() or 0

    return CommentEventListResponse(
        items=[CommentEventResponse.model_validate(i) for i in items],
        unread_count=unread_count,
        total=total,
    )


@router.get("/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db)):
    q = await db.execute(
        select(func.count()).select_from(CommentEvent).where(CommentEvent.is_read == False)
    )
    return {"unread": q.scalar() or 0}


@router.post("/{event_id}/mark-read", response_model=CommentEventResponse)
async def mark_read(event_id: int, db: AsyncSession = Depends(get_db)):
    ev = await db.get(CommentEvent, event_id)
    if not ev:
        raise HTTPException(404, "Comment event not found")
    ev.is_read = True
    await db.commit()
    await db.refresh(ev)
    return ev


@router.post("/mark-all-read")
async def mark_all_read(db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(CommentEvent).where(CommentEvent.is_read == False))
    events = q.scalars().all()
    for ev in events:
        ev.is_read = True
    await db.commit()
    return {"marked": len(events)}


@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: int, db: AsyncSession = Depends(get_db)):
    ev = await db.get(CommentEvent, event_id)
    if not ev:
        raise HTTPException(404, "Comment event not found")
    await db.delete(ev)
    await db.commit()


@router.post("/backfill-permalinks")
async def backfill_permalinks(request: Request, db: AsyncSession = Depends(get_db)):
    """Look up Graph-API permalink for any event missing one. Idempotent."""
    ig_client = getattr(request.app.state, "ig_client", None)
    if not ig_client or not hasattr(ig_client, "get_media_permalink"):
        raise HTTPException(503, "Instagram client unavailable")

    rows_q = await db.execute(
        select(CommentEvent).where(
            (CommentEvent.permalink.is_(None)) & (CommentEvent.media_id != "")
        )
    )
    rows = rows_q.scalars().all()
    updated = 0
    for ev in rows:
        try:
            link = await ig_client.get_media_permalink(ev.media_id)
        except Exception:
            link = None
        if link:
            ev.permalink = link
            updated += 1
    if updated:
        await db.commit()
    return {"checked": len(rows), "updated": updated}


@router.post("/{event_id}/open-conversation")
async def open_conversation(event_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Find the active conversation for the commenter (or create one) and
    return its id, so the frontend can jump straight into the DM thread.

    Marks the comment event as read.
    """
    from app.models.conversation import Conversation
    from sqlalchemy import select

    ev = await db.get(CommentEvent, event_id)
    if not ev:
        raise HTTPException(404, "Comment event not found")
    if not ev.user_id:
        raise HTTPException(400, "Comment has no user_id; cannot open conversation")

    # Match the lookup logic in MessageHandler._get_or_create_conversation
    result = await db.execute(
        select(Conversation)
        .where(Conversation.ig_user_id == ev.user_id, Conversation.is_resolved == False)
        .order_by(Conversation.created_at.desc())
    )
    conv = result.scalar_one_or_none()

    if not conv:
        # Read the manager-set default mode, same as auto-created DM convs
        from app.models.settings import SystemSettings
        mode_setting_q = await db.execute(
            select(SystemSettings).where(SystemSettings.key == "default_conversation_mode")
        )
        mode_setting = mode_setting_q.scalar_one_or_none()
        default_mode = mode_setting.value if mode_setting and mode_setting.value in ("ai", "human") else "ai"
        conv = Conversation(
            ig_user_id=ev.user_id,
            ig_username=ev.username or "",
            trigger_source="manual_from_comment",
            mode=default_mode,
        )
        db.add(conv)
        await db.flush()

    ev.is_read = True
    await db.commit()
    await db.refresh(conv)
    return {"conversation_id": conv.id}
