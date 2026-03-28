from pydantic import BaseModel


class DashboardStats(BaseModel):
    weekly_conversations: int
    ai_resolution_rate: float  # percentage 0-100
    comment_triggers: int
