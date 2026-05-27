"""Unit tests for Tidio webhook envelope parsing + signature verification.

These tests are deliberately I/O-free — they exercise pure functions in
`app.channels.tidio.webhook_handler` so they're fast and don't depend on
network, DB, or env vars.
"""
import hashlib
import hmac
import json

import pytest

from app.channels.tidio.webhook_handler import (
    parse_envelope,
    parse_ticket_replied,
    verify_signature,
    RELEVANT_TOPIC,
)


# --------------------------------------------------------------------------
# Envelope parsing
# --------------------------------------------------------------------------

def _envelope(topic: str, content: dict, webhook_id: str = "wh-abc-123") -> dict:
    return {
        "created_at": 1700000000,
        "project_public_key": "pk_test",
        "topic": topic,
        "version": 1,
        "webhook_id": webhook_id,
        "content": content,
    }


def test_parse_envelope_happy_path():
    data = _envelope("ticket.replied", {"id": 42})
    env = parse_envelope(data)
    assert env is not None
    assert env["topic"] == "ticket.replied"
    assert env["webhook_id"] == "wh-abc-123"
    assert env["content"] == {"id": 42}


def test_parse_envelope_missing_topic_returns_none():
    data = _envelope("ticket.replied", {"id": 42})
    del data["topic"]
    assert parse_envelope(data) is None


def test_parse_envelope_missing_webhook_id_returns_none():
    data = _envelope("ticket.replied", {"id": 42})
    del data["webhook_id"]
    assert parse_envelope(data) is None


def test_parse_envelope_non_dict_returns_none():
    assert parse_envelope("not-a-dict") is None  # type: ignore[arg-type]
    assert parse_envelope(None) is None  # type: ignore[arg-type]


# --------------------------------------------------------------------------
# ticket.replied → IncomingMessage
# --------------------------------------------------------------------------

def _ticket_replied(author_type: str = "contact", **overrides) -> dict:
    """Build a ticket.replied content dict matching the Tidio docs sample."""
    content = {
        "id": 10000,
        "status": "open",
        "subject": "A delivery problem",
        "message": {
            "author_id": "b9af081a-8ab5-40fb-8033-f6fae058bad7",
            "created_at": "2023-10-02T13:11:25+00:00",
            "message_id": "01HBTFSW6QVSP7F5C1JXKMT17G",
            "message_type": "public",
            "message_content": "Hi, where's my order?",
            "author_type": author_type,
        },
        "contact_id": "147ae37d-43bc-42a6-bc7b-c10d1525a2f7",
    }
    content.update(overrides)
    return content


def test_ticket_replied_from_contact_produces_incoming_message():
    msg = parse_ticket_replied(_ticket_replied(author_type="contact"))
    assert msg is not None
    assert msg.channel == "tidio"
    assert msg.sender_id == "147ae37d-43bc-42a6-bc7b-c10d1525a2f7"
    assert msg.thread_id == "10000"
    assert msg.text == "Hi, where's my order?"
    assert msg.message_id == "01HBTFSW6QVSP7F5C1JXKMT17G"


def test_ticket_replied_from_operator_returns_none():
    """Operator messages (including our own bot replies) must be filtered
    out — forwarding them through the AI would create an infinite loop."""
    assert parse_ticket_replied(_ticket_replied(author_type="operator")) is None


def test_ticket_replied_internal_note_returns_none():
    """Operator-internal notes are also non-customer traffic."""
    msg = _ticket_replied(author_type="contact")
    # Imitate an internal note: author is operator-ish; we strict-match
    # "contact" so anything else is excluded.
    msg["message"]["author_type"] = "internal"
    assert parse_ticket_replied(msg) is None


def test_ticket_replied_missing_message_returns_none():
    content = _ticket_replied()
    del content["message"]
    assert parse_ticket_replied(content) is None


def test_ticket_replied_with_no_content_text_keeps_empty_string():
    content = _ticket_replied()
    content["message"]["message_content"] = ""
    msg = parse_ticket_replied(content)
    assert msg is not None
    assert msg.text == ""


# --------------------------------------------------------------------------
# Signature verification
# --------------------------------------------------------------------------

def _make_signature(body: bytes, ts: str, secret: str) -> str:
    return hmac.new(secret.encode(), body + b"_" + ts.encode(), hashlib.sha256).hexdigest()


def test_signature_verifies_matching_pair():
    body = json.dumps({"hello": "world"}).encode()
    secret = "s3cr3t"
    ts = "1700000000"
    sig = _make_signature(body, ts, secret)
    header = f"t={ts},s={sig}"
    assert verify_signature(body, header, secret) is True


def test_signature_rejects_tampered_body():
    body = b'{"hello":"world"}'
    secret = "s3cr3t"
    ts = "1700000000"
    sig = _make_signature(body, ts, secret)
    header = f"t={ts},s={sig}"
    # Body was modified after signing — must fail
    assert verify_signature(b'{"hello":"WORLD"}', header, secret) is False


def test_signature_accepts_when_any_listed_signature_matches():
    """Tidio sends multiple `s=` values during key rotation."""
    body = b'{"x":1}'
    secret = "real-secret"
    ts = "1700000000"
    good_sig = _make_signature(body, ts, secret)
    bad_sig = "0" * 64
    header = f"t={ts},s={bad_sig},s={good_sig}"
    assert verify_signature(body, header, secret) is True


def test_signature_returns_false_on_missing_secret():
    body = b'{"x":1}'
    header = "t=1,s=abc"
    assert verify_signature(body, header, "") is False


def test_signature_returns_false_on_malformed_header():
    body = b'{"x":1}'
    secret = "s"
    assert verify_signature(body, "garbage", secret) is False
    assert verify_signature(body, "", secret) is False
    assert verify_signature(body, "t=1", secret) is False  # no s=
    assert verify_signature(body, "s=abc", secret) is False  # no t=


# --------------------------------------------------------------------------
# Sanity: the topic constant is what the router checks against
# --------------------------------------------------------------------------

def test_relevant_topic_is_ticket_replied():
    """If this constant ever drifts the router stops processing inbound
    messages silently — pin it explicitly."""
    assert RELEVANT_TOPIC == "ticket.replied"
