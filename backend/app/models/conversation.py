from datetime import datetime, timezone
from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ig_user_id: Mapped[str] = mapped_column(String(100), index=True)
    ig_username: Mapped[str] = mapped_column(String(100), default="")
    ig_profile_pic: Mapped[str | None] = mapped_column(String(500), nullable=True)
    trigger_source: Mapped[str] = mapped_column(String(50), default="direct_dm")  # "comment_rule" | "direct_dm" | "simulation"
    trigger_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("comment_trigger_rules.id"), nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="ai")  # "ai" | "human"
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user" | "assistant" | "system"
    content: Mapped[str] = mapped_column(Text)
    original_content: Mapped[str | None] = mapped_column(Text, nullable=True)  # before translation
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
