from pydantic import BaseModel
from datetime import datetime


class RuleCreate(BaseModel):
    name: str
    keywords: list[str]
    match_mode: str = "contains"
    public_reply_template: str = ""
    dm_template: str = ""
    follow_up_mode: str = "ai"
    is_active: bool = True


class RuleUpdate(BaseModel):
    name: str | None = None
    keywords: list[str] | None = None
    match_mode: str | None = None
    public_reply_template: str | None = None
    dm_template: str | None = None
    follow_up_mode: str | None = None
    is_active: bool | None = None


class RuleResponse(BaseModel):
    id: int
    name: str
    keywords: list[str]
    match_mode: str
    public_reply_template: str
    dm_template: str
    follow_up_mode: str
    is_active: bool
    trigger_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
