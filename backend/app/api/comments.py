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


@router.post("/{event_id}/dm")
async def send_manual_dm(event_id: int, payload: dict, request: Request, db: AsyncSession = Depends(get_db)):
    """Manager-triggered DM to the commenter. Marks the event as read."""
    ev = await db.get(CommentEvent, event_id)
    if not ev:
        raise HTTPException(404, "Comment event not found")
    text = (payload.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "text required")
    ig_client = getattr(request.app.state, "ig_client", None)
    if not ig_client:
        raise HTTPException(503, "Instagram client unavailable")
    try:
        sent = await ig_client.send_dm(ev.user_id, text)
    except Exception as e:
        raise HTTPException(502, f"Instagram send failed: {e}")
    ev.is_read = True
    await db.commit()
    return {"sent": bool(sent)}
