from pydantic import BaseModel
from datetime import datetime


class KnowledgeCreate(BaseModel):
    question: str
    answer: str
    category: str = ""
    is_active: bool = True


class KnowledgeUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    category: str | None = None
    is_active: bool | None = None


class KnowledgeResponse(BaseModel):
    id: int
    question: str
    answer: str
    category: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
