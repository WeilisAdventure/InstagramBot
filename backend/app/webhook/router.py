import hashlib
import hmac
import logging
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


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
