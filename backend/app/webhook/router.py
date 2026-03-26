import hashlib
import hmac
import logging
from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from app.config import settings
from app.instagram.base import IncomingMessage
from app.webhook.parser import parse_messaging_events

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])


@router.get("")
async def verify_webhook(
    hub_mode: str = "",
    hub_verify_token: str = "",
    hub_challenge: str = "",
):
    """Meta webhook verification handshake."""
    # FastAPI converts hub.mode to hub_mode via alias; we also accept query params directly
    if hub_mode == "subscribe" and hub_verify_token == settings.instagram_verify_token:
        return int(hub_challenge)
    raise HTTPException(403, "Verification failed")


@router.post("")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    """Receive webhook events from Meta."""
    body = await request.body()

    # Verify signature
    signature = request.headers.get("X-Hub-Signature-256", "")
    if settings.instagram_app_secret and signature:
        expected = "sha256=" + hmac.new(
            settings.instagram_app_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature, expected):
            raise HTTPException(403, "Invalid signature")

    data = await request.json()
    if data.get("object") != "instagram":
        return {"status": "ignored"}

    handler = request.app.state.message_handler
    messages = parse_messaging_events(data)
    for msg in messages:
        background_tasks.add_task(handler.handle_dm, msg)

    return "EVENT_RECEIVED"
