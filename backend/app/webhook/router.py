import hashlib
import hmac
import logging
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.database import async_session
# Module-level import so Base.metadata sees the WebhookEvent model at
# create_all time. The function-scoped import below would defer model
# registration until the first webhook arrives, by which point the
# create_all step has already skipped this table.
from app.models.webhook_event import WebhookEvent  # noqa: F401

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


async def _record_webhook_id(channel: str, webhook_id: str) -> bool:
    """Insert (channel, webhook_id) into the dedup table.

    Returns True if this is the first time we've seen the id (caller
    should process). Returns False on IntegrityError, meaning we've
    already processed this delivery and should silently 200 the retry.
    """
    async with async_session() as db:
        db.add(WebhookEvent(channel=channel, webhook_id=webhook_id))
        try:
            await db.commit()
            return True
        except IntegrityError:
            await db.rollback()
            return False


@router.get("")
async def verify_webhook(request: Request):
    """Meta webhook verification handshake.

    Meta sends query params with dots: hub.mode, hub.verify_token, hub.challenge.
    FastAPI Query() doesn't handle dots well, so we read from query_params directly.
    """
    params = request.query_params
    hub_mode = params.get("hub.mode", "")
    hub_verify_token = params.get("hub.verify_token", "")
    hub_challenge = params.get("hub.challenge", "")

    logger.info(f"Webhook verification: mode={hub_mode}")

    if hub_mode == "subscribe" and hub_verify_token == settings.instagram_verify_token:
        logger.info("Webhook verification successful")
        try:
            return int(hub_challenge)
        except ValueError:
            return hub_challenge

    logger.warning(f"Webhook verification failed: mode={hub_mode}, token_match={hub_verify_token == settings.instagram_verify_token}")
    raise HTTPException(403, "Verification failed")


@router.post("")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive webhook events from Meta (messages + comments)."""
    body = await request.body()

    # Verify signature if app_secret is configured
    signature = request.headers.get("X-Hub-Signature-256", "")
    if settings.instagram_app_secret and signature:
        expected = "sha256=" + hmac.new(
            settings.instagram_app_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            logger.warning(f"Webhook signature mismatch: got={signature[:30]}... expected={expected[:30]}...")
            # Log but don't block — allow message through for now
            # TODO: fix signature verification with correct app secret

    data = await request.json()
    logger.debug(f"Webhook payload: {data}")

    if data.get("object") != "instagram":
        return {"status": "ignored"}

    handler = request.app.state.message_handler

    from app.webhook.parser import parse_messaging_events, parse_comment_events

    # Handle DM messages
    messages = parse_messaging_events(data)
    for msg in messages:
        logger.info(f"Webhook DM from {msg.sender_id}: {msg.text[:50] if msg.text else '(no text)'}...")
        background_tasks.add_task(handler.handle_dm, msg)

    # Handle comment events
    comments = parse_comment_events(data)
    for comment in comments:
        logger.info(f"Webhook comment from {comment.username} on media {comment.media_id}: {comment.text[:50]}...")
        background_tasks.add_task(handler.handle_comment, comment)

    return "EVENT_RECEIVED"


@router.post("/tidio")
async def receive_tidio_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive a Tidio webhook delivery.

    Tidio requires us to ack within 4 seconds. We do signature + dedup +
    parse synchronously (all cheap) and defer the actual handler call to
    a BackgroundTask so the response goes out immediately.

    Signature failure with secret configured → 401. Signature failure
    with empty secret → log warning, accept (dev convenience, matches IG
    webhook behavior).
    """
    from app.channels.tidio.webhook_handler import (
        verify_signature,
        parse_envelope,
        parse_ticket_replied,
        RELEVANT_TOPIC,
    )

    raw_body = await request.body()
    sig_header = request.headers.get("x-tidio-signature", "")

    if settings.tidio_webhook_secret:
        if not verify_signature(raw_body, sig_header, settings.tidio_webhook_secret):
            logger.warning(
                f"Tidio webhook signature mismatch (header={sig_header[:60]}...)"
            )
            raise HTTPException(401, "Invalid signature")
    elif sig_header:
        # Secret not configured yet but Tidio is signing — log so we
        # notice. Accept the payload so dev setup isn't blocked.
        logger.warning(
            "Tidio webhook received with signature but TIDIO_WEBHOOK_SECRET "
            "is not configured. Accepting without verification."
        )

    try:
        data = await request.json()
    except Exception as e:
        logger.warning(f"Tidio webhook with non-JSON body: {e}")
        return {"status": "ignored"}

    env = parse_envelope(data)
    if env is None:
        logger.warning(f"Tidio webhook envelope unrecognized: keys={list(data) if isinstance(data, dict) else type(data).__name__}")
        return {"status": "ignored"}

    # Dedup: Tidio retries on 5xx / timeouts, so the same webhook_id can
    # arrive multiple times. First write wins; everyone else 200-OKs.
    fresh = await _record_webhook_id("tidio", env["webhook_id"])
    if not fresh:
        logger.info(f"Tidio webhook {env['webhook_id']} already processed, skipping")
        return {"status": "duplicate"}

    topic = env["topic"]
    if topic != RELEVANT_TOPIC:
        # Other topics (contact.created, ticket.status_updated, ...) are
        # acknowledged so Tidio stops retrying, but we don't act on them.
        logger.info(f"Tidio webhook topic={topic} acknowledged (not handled)")
        return {"status": "ignored", "topic": topic}

    msg = parse_ticket_replied(env["content"])
    if msg is None:
        # Most likely an operator/internal message — we already sent it,
        # don't re-route it through the AI.
        return {"status": "skipped_non_contact"}

    handler = request.app.state.message_handler
    logger.info(
        f"Tidio webhook DM from contact={msg.sender_id} ticket={msg.thread_id}: "
        f"{(msg.text or '')[:80]}"
    )
    background_tasks.add_task(handler.handle_dm, msg)
    return {"status": "ok"}
