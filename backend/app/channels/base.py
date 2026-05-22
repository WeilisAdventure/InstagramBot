"""Cross-channel message abstraction.

Every messaging source (Instagram DM, Tidio live chat, future: WhatsApp,
Messenger, ...) implements `ChannelClient`. The handler layer dispatches on
`IncomingMessage.channel` and treats all sources uniformly.

Channel-specific surface (e.g. Instagram comments / Graph permalink lookup)
lives on the subclass — it's not part of the cross-channel contract.
"""
from abc import ABC, abstractmethod
from typing import Callable, Awaitable
from dataclasses import dataclass, field


@dataclass
class Attachment:
    type: str  # "image" | "video" | "audio" | "file" | "share" | "story_mention" | "ig_reel" | ...
    url: str


@dataclass
class IncomingMessage:
    """A DM-style message arriving from any channel.

    `channel` is the routing key the handler uses to dispatch to the right
    outbound client / settings scope / AI prompt. `sender_id` is unique only
    within a channel — pair (channel, sender_id) is what identifies a user
    globally.
    """
    sender_id: str
    sender_username: str
    message_id: str
    text: str | None
    timestamp: float
    channel: str = "instagram"  # default kept so old call sites stay valid during the transition
    attachments: list[Attachment] = field(default_factory=list)


MessageHandler = Callable[[IncomingMessage], Awaitable[None]]


class ChannelClient(ABC):
    """Abstract base for any inbound/outbound messaging source.

    The contract is intentionally minimal (DM in, DM out, lifecycle). Anything
    channel-specific — comments, profile lookups, attachments-upload — belongs
    on the subclass and the handler can check via `hasattr`.
    """

    channel: str = ""  # subclasses override, e.g. "instagram", "tidio"

    _message_handler: MessageHandler | None = None

    def set_message_handler(self, handler: MessageHandler):
        self._message_handler = handler

    @abstractmethod
    async def start_polling(self):
        """Start polling / open connection. For webhook-driven clients this
        may be a no-op or a token-verify."""
        ...

    @abstractmethod
    async def stop_polling(self):
        """Cleanly stop. Idempotent."""
        ...

    @abstractmethod
    async def send_dm(self, user_id: str, text: str) -> bool:
        """Send a direct message. Returns True on success."""
        ...
