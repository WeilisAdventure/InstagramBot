from abc import ABC, abstractmethod
from typing import Callable, Awaitable
from dataclasses import dataclass


@dataclass
class IncomingMessage:
    sender_id: str
    sender_username: str
    message_id: str
    text: str | None
    timestamp: float


@dataclass
class IncomingComment:
    comment_id: str
    media_id: str
    user_id: str
    username: str
    text: str
    timestamp: float


MessageHandler = Callable[[IncomingMessage], Awaitable[None]]
CommentHandler = Callable[[IncomingComment], Awaitable[None]]


class InstagramClient(ABC):
    _message_handler: MessageHandler | None = None
    _comment_handler: CommentHandler | None = None

    def set_message_handler(self, handler: MessageHandler):
        self._message_handler = handler

    def set_comment_handler(self, handler: CommentHandler):
        self._comment_handler = handler

    @abstractmethod
    async def start_polling(self):
        """Start polling for new DMs and comments."""
        ...

    @abstractmethod
    async def stop_polling(self):
        """Stop polling."""
        ...

    @abstractmethod
    async def send_dm(self, user_id: str, text: str) -> bool:
        """Send a direct message. Returns True on success."""
        ...

    @abstractmethod
    async def reply_to_comment(self, media_id: str, comment_id: str, text: str) -> bool:
        """Reply to a comment on a post. Returns True on success."""
        ...
