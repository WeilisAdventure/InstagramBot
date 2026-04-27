from datetime import datetime, timezone
from sqlalchemy import String, Integer, Text, Boolean, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CommentEvent(Base):
    """Every incoming Instagram comment is logged here, regardless of whether
    the comment-trigger feature is enabled. Gives the manager visibility
    into comment activity even when auto-actions are paused.
    """

    __tablename__ = "comment_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Native Instagram comment id, unique to dedupe webhook retries.
    comment_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    media_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[str] = mapped_column(String(64), index=True)
    username: Mapped[str] = mapped_column(String(120), default="")
    text: Mapped[str] = mapped_column(Text, default="")

    # Did we match a trigger rule and act on it?
    matched_rule_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # auto_replied | skipped_disabled | no_match
    action_taken: Mapped[str] = mapped_column(String(32), default="no_match")

    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Public Instagram URL of the post the comment is on; populated lazily
    # via Graph API after the event is logged.
    permalink: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


Index("ix_comment_events_unread_recent", CommentEvent.is_read, CommentEvent.created_at)
