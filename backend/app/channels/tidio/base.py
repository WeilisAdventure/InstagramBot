"""Tidio channel client.

Webhook-driven inbound (no polling) + REST-driven outbound. The
`set_message_handler` callback is invoked from the webhook router, not
from this client — so `start_polling` / `stop_polling` are no-ops.

Outbound `send_dm` requires a `thread_id` (Tidio ticket id) because Tidio
addresses replies by ticket, not by contact. The handler reads the ticket
id from the conversation row (populated by the webhook).
"""
from __future__ import annotations

import logging
from typing import Any

from app.channels.base import ChannelClient
from app.channels.tidio.api_client import TidioApiClient

logger = logging.getLogger(__name__)


class TidioClient(ChannelClient):
    channel: str = "tidio"

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        operator_id: str = "",
        api_base: str = "https://api.tidio.com",
    ):
        self._creds_ok = bool(client_id and client_secret)
        self.api = TidioApiClient(
            client_id=client_id,
            client_secret=client_secret,
            operator_id=operator_id,
            api_base=api_base,
        )

    @property
    def connected(self) -> bool:
        """Used by `/api/conversations` lazy profile lookup gating. For
        Tidio this is just "are credentials configured" — there's no
        persistent connection to fail."""
        return self._creds_ok

    async def start_polling(self):
        # Webhook-driven; nothing to start.
        return

    async def stop_polling(self):
        await self.api.aclose()

    async def send_dm(self, user_id: str, text: str, *, thread_id: str | None = None) -> bool:
        """Send an operator reply to the Tidio ticket.

        `user_id` is accepted to satisfy the ChannelClient interface but
        not used — Tidio routes by ticket_id, which we get from `thread_id`.
        If `thread_id` is missing, we refuse rather than guessing the wrong
        ticket (the caller has the conversation row and can supply it).
        """
        del user_id  # Tidio addresses by ticket, not contact
        if not thread_id:
            logger.error(
                "TidioClient.send_dm called without thread_id (ticket id) — "
                "refusing to send to avoid replying in the wrong ticket."
            )
            return False
        return await self.api.reply_to_ticket(thread_id, text)

    async def get_user_profile(self, user_id: str) -> dict[str, Any] | None:
        """Used by MessageHandler / `/api/conversations` to backfill the
        contact's display name + avatar. Returns the same shape the IG
        client uses so the handler stays channel-agnostic.
        """
        contact = await self.api.get_contact(user_id)
        if not contact:
            return None
        # Compose a display name from first/last/email so the inbox shows
        # something useful even when the visitor never filled in a name.
        first = (contact.get("first_name") or "").strip()
        last = (contact.get("last_name") or "").strip()
        email = (contact.get("email") or "").strip()
        if first or last:
            display = f"{first} {last}".strip()
        elif email:
            display = email
        else:
            display = ""
        return {
            "username": display,
            "name": display,
            "profile_pic": contact.get("avatar"),
            "profile_picture_url": contact.get("avatar"),
            "email": email,
        }
