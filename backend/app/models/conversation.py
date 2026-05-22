from datetime import datetime, timezone
from sqlalchemy import String, Integer, Text, Boolean, DateTime, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Routing key: "instagram" | "tidio" | future channels. Pair
    # (channel, external_user_id) is what uniquely identifies a user globally —
    # the same numeric ID can collide across channels.
    channel: Mapped[str] = mapped_column(String(20), default="instagram", index=True)
    external_user_id: Mapped[str] = mapped_column(String(100), index=True)
    external_username: Mapped[str] = mapped_column(String(100), default="")
    external_profile_pic: Mapped[str | None] = mapped_column(String(500), nullable=True)
    trigger_source: Mapped[str] = mapped_column(String(50), default="direct_dm")  # "comment_rule" | "direct_dm" | "simulation"
    trigger_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("comment_trigger_rules.id"), nullable=True)
    mode: Mapped[str] = mapped_column(String(20), default="ai")  # "ai" | "human"
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_prompt_notes: Mapped[str | None] = mapped_column(Text, nullable=True)  # accumulated per-conversation prompt notes
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", order_by="Message.created_at")

    __table_args__ = (
        Index("ix_conversations_channel_external_user_id", "channel", "external_user_id"),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(20))  # "user" | "assistant" | "system"
    content: Mapped[str] = mapped_column(Text)
    original_content: Mapped[str | None] = mapped_column(Text, nullable=True)  # before translation
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False)
    # List of {"type": "image"|..., "url": "/media/attachments/<uuid>.<ext>"} entries.
    # Stored as JSON so the schema can grow (mime, size, original_url) without a migration.
    attachments: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
