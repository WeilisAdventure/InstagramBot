from datetime import datetime
from pydantic import BaseModel


class PreferenceCreate(BaseModel):
    content: str
    is_active: bool = True


class PreferenceUpdate(BaseModel):
    content: str | None = None
    is_active: bool | None = None


class PreferenceResponse(BaseModel):
    id: int
    content: str
    source_prompt: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
