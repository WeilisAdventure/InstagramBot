from datetime import datetime
from pydantic import BaseModel


class CommentEventResponse(BaseModel):
    id: int
    comment_id: str
    media_id: str
    user_id: str
    username: str
    text: str
    matched_rule_id: int | None
    action_taken: str
    is_read: bool
    permalink: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class CommentEventListResponse(BaseModel):
    items: list[CommentEventResponse]
    unread_count: int
    total: int
