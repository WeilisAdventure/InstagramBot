"""Instagram-specific channel client surface.

Inherits the generic DM contract from `ChannelClient` and adds the IG-only
extras (comments, profile lookups, post permalinks). Tidio and other future
channels do not implement these — the handler should `hasattr`-check before
calling, or restrict comment handling to IG-only code paths.
"""
from abc import abstractmethod
from typing import Callable, Awaitable
from dataclasses import dataclass

from app.channels.base import (
    ChannelClient,
    IncomingMessage,
    Attachment,
    MessageHandler,
)

__all__ = [
    "InstagramClient",
    "IncomingMessage",
    "IncomingComment",
    "Attachment",
    "MessageHandler",
    "CommentHandler",
]


@dataclass
class IncomingComment:
    comment_id: str
    media_id: str
    user_id: str
    username: str
    text: str
    timestamp: float


CommentHandler = Callable[["IncomingComment"], Awaitable[None]]


class InstagramClient(ChannelClient):
    channel: str = "instagram"

    _comment_handler: CommentHandler | None = None

    def set_comment_handler(self, handler: CommentHandler):
        self._comment_handler = handler

    @abstractmethod
    async def reply_to_comment(self, media_id: str, comment_id: str, text: str) -> bool:
        """Reply to a comment on a post. Returns True on success."""
        ...
