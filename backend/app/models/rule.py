from datetime import datetime, timezone
from sqlalchemy import String, Integer, Text, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class CommentTriggerRule(Base):
    __tablename__ = "comment_trigger_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    keywords: Mapped[list] = mapped_column(JSON, default=list)  # ["keyword1", "keyword2"]
    match_mode: Mapped[str] = mapped_column(String(20), default="contains")  # "contains" | "exact" | "regex"
    public_reply_template: Mapped[str] = mapped_column(Text, default="")
    dm_template: Mapped[str] = mapped_column(Text, default="")  # supports {name} placeholder
    follow_up_mode: Mapped[str] = mapped_column(String(20), default="ai")  # "ai" | "human"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
