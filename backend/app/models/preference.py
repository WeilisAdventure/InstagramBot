from datetime import datetime
from sqlalchemy import String, Integer, Text, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ManagerPreference(Base):
    """A long-term preference inferred from manager-provided prompts.

    Distilled by an LLM from per-call prompt hints (e.g. "用中文回复",
    "语气友善", "报价前先问月单量") and injected into the system prompt so
    future replies match the manager's preferred style.
    """

    __tablename__ = "manager_preferences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    content: Mapped[str] = mapped_column(Text)
    source_prompt: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.utcnow()
    )
