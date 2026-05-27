"""Tidio webhook envelope parsing + signature verification.

Pure functions. No DB, no HTTP, no logging side effects beyond returning
parsed results. The router glues this to FastAPI / message_handler.

Webhook envelope shape (every event):
    {
      "created_at": <unix>,
      "project_public_key": "...",
      "topic": "<event_topic>",
      "version": 1,
      "webhook_id": "<uuid>",
      "content": { ... event-specific ... }
    }

Signature header:
    x-tidio-signature: t=<timestamp>,s=<sig1>,s=<sig2>
    HMAC-SHA256(<raw_body> + "_" + <timestamp>, secret) — match any s=.

Docs:
    https://developers.tidio.com/docs/webhooks-structure
    https://developers.tidio.com/docs/webhooks-signature-verification
    https://developers.tidio.com/reference/events
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

from app.channels.base import IncomingMessage

logger = logging.getLogger(__name__)

# Only ticket.replied actually delivers a message body we'd want to forward
# to the AI / save to the inbox. Other topics (contact.created, ticket.*,
# conversation.solved_*) are logged but ignored for now.
RELEVANT_TOPIC = "ticket.replied"


def verify_signature(raw_body: bytes, header_value: str, secret: str) -> bool:
    """Verify Tidio's x-tidio-signature header.

    Returns True if any signature in the header matches the HMAC-SHA256 of
    `<body>_<timestamp>` computed with `secret`. Returns False on any
    parse error or mismatch.

    The caller decides what to do with False (block vs warn-and-accept) —
    this function never raises.
    """
    if not secret or not header_value:
        return False

    # Header format: t=<ts>,s=<sig1>,s=<sig2>
    parts = [p.strip() for p in header_value.split(",") if p.strip()]
    ts: str | None = None
    sigs: list[str] = []
    for p in parts:
        if "=" not in p:
            continue
        k, v = p.split("=", 1)
        if k == "t":
            ts = v
        elif k == "s":
            sigs.append(v)

    if not ts or not sigs:
        return False

    signed_payload = raw_body + b"_" + ts.encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), signed_payload, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, s) for s in sigs)


def parse_envelope(data: dict[str, Any]) -> dict[str, Any] | None:
    """Pull out the fields every event has. Returns None if the payload
    isn't a recognizable Tidio envelope (so the router can 200-OK and
    move on without crashing)."""
    if not isinstance(data, dict):
        return None
    topic = data.get("topic")
    webhook_id = data.get("webhook_id")
    content = data.get("content")
    if not topic or not webhook_id or not isinstance(content, dict):
        return None
    return {
        "topic": topic,
        "webhook_id": webhook_id,
        "version": data.get("version", 1),
        "created_at": data.get("created_at", 0),
        "content": content,
    }


def parse_ticket_replied(content: dict[str, Any]) -> IncomingMessage | None:
    """Turn a `ticket.replied` event into an IncomingMessage, IFF the
    author is a contact (not an operator or internal note).

    Returns None for operator / internal-note messages — the bot's own
    replies generate webhook events too, and forwarding those to the AI
    would create an infinite loop.
    """
    msg = content.get("message")
    if not isinstance(msg, dict):
        return None

    author_type = msg.get("author_type")
    if author_type != "contact":
        # Operator messages (including our own bot replies) and internal
        # notes don't need to be processed by the AI / saved as user
        # messages. They'll surface naturally when our own send_dm path
        # writes the assistant message to the DB.
        return None

    ticket_id = content.get("id")
    contact_id = content.get("contact_id") or msg.get("author_id") or ""
    message_id = msg.get("message_id") or ""
    text = msg.get("message_content") or ""
    # Tidio sends ISO 8601 timestamps on inner message events. Convert to
    # unix-ish float so it lines up with the IG path. Best-effort: 0 if
    # parse fails — the DB doesn't rely on this value for ordering (it
    # uses its own created_at).
    timestamp = _parse_iso_timestamp(msg.get("created_at"))

    return IncomingMessage(
        channel="tidio",
        sender_id=str(contact_id),
        sender_username="",  # filled in via get_user_profile later
        message_id=str(message_id),
        text=text,
        timestamp=timestamp,
        thread_id=str(ticket_id) if ticket_id is not None else None,
        attachments=[],  # webhook payload didn't show attachments; TBD
    )


def _parse_iso_timestamp(value: Any) -> float:
    """Parse "2023-10-02T13:11:25+00:00" → unix seconds. Returns 0.0 on
    any failure — the field is informational only."""
    if not isinstance(value, str):
        return 0.0
    try:
        from datetime import datetime
        # fromisoformat handles "+00:00"; older Pythons (<3.11) didn't
        # handle "Z" but our deploy is 3.11+.
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.timestamp()
    except (ValueError, TypeError):
        return 0.0
