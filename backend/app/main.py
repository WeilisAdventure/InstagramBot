import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from app.config import settings
from app.database import init_db
from app.ai.factory import create_ai_provider
from app.channels.factory import create_channel_clients
from app.services.message_handler import MessageHandler
from app.services.translator import TranslatorService
from app.api import auth, dashboard, rules, conversations, preferences, comments, knowledge
from app.api import settings as settings_api
from app.webhook.router import router as webhook_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))

    # Silence noisy third-party loggers
    logging.getLogger("instagrapi").setLevel(logging.WARNING)
    logging.getLogger("private_request").setLevel(logging.WARNING)
    logging.getLogger("public_request").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    logger.info("Initializing database...")
    await init_db()

    logger.info(f"Creating AI provider: {settings.ai_provider}")
    ai = create_ai_provider(settings)
    app.state.ai_provider = ai

    logger.info(f"Creating channel clients (IG mode={settings.ig_mode})")
    clients = create_channel_clients(settings)
    app.state.channel_clients = clients
    # Back-compat: a few places (API send endpoint, /health, conversations
    # profile backfill) still reach for `app.state.ig_client`. Keep the
    # alias pointing at the IG client.
    ig = clients.get("instagram")
    app.state.ig_client = ig

    handler = MessageHandler(ai, clients, reply_delay=settings.reply_delay_seconds)
    app.state.message_handler = handler

    translator = TranslatorService(ai)
    app.state.translator = translator

    # Wire handler callbacks for every channel that supports them
    for ch_name, ch_client in clients.items():
        ch_client.set_message_handler(handler.handle_dm)
        if hasattr(ch_client, "set_comment_handler"):
            ch_client.set_comment_handler(handler.handle_comment)

    # Start each channel (polling for instagrapi, token verify for graph_api,
    # webhook-only channels may no-op).
    for ch_name, ch_client in clients.items():
        try:
            await ch_client.start_polling()
            if ch_name == "instagram" and settings.ig_mode == "graph_api":
                logger.info("Graph API mode: webhooks will handle incoming messages/comments")
        except Exception as e:
            logger.error(f"Channel '{ch_name}' init failed: {e}")
            logger.warning(
                f"Bot started WITHOUT {ch_name} connection. "
                "Dashboard and API are available. "
                "Fix the credentials, then restart."
            )

    yield

    # Shutdown
    logger.info("Stopping channel clients...")
    for ch_name, ch_client in clients.items():
        try:
            await ch_client.stop_polling()
        except Exception as e:
            logger.warning(f"Stop polling for '{ch_name}' failed: {e}")


app = FastAPI(title="Instagram Bot", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://instagrambot.live", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount auth (public)
app.include_router(auth.router)

# Mount API routes (protected)
app.include_router(dashboard.router)
app.include_router(rules.router)
app.include_router(conversations.router)
app.include_router(settings_api.router)
app.include_router(preferences.router)
app.include_router(comments.router)
app.include_router(knowledge.router)

# Mount webhook (always available, primary for graph_api mode)
app.include_router(webhook_router)

# Serve downloaded DM attachments. UUID filenames make the URL the capability,
# so the mount stays open (browser <img> can't carry our Bearer token).
_MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
_MEDIA_DIR.mkdir(parents=True, exist_ok=True)
(_MEDIA_DIR / "attachments").mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_MEDIA_DIR)), name="media")


@app.get("/privacy", response_class=HTMLResponse)
async def privacy_policy():
    return """<!DOCTYPE html><html><head><title>Privacy Policy - InstaBot</title></head>
    <body style="max-width:800px;margin:40px auto;font-family:sans-serif;padding:0 20px">
    <h1>Privacy Policy</h1><p>Last updated: 2026-03-26</p>
    <h2>Information We Collect</h2><p>This app processes Instagram messages and comments to provide automated customer service responses.</p>
    <h2>How We Use Information</h2><p>Messages are processed by AI to generate helpful responses. We do not sell or share your data with third parties.</p>
    <h2>Data Retention</h2><p>Conversation data is stored securely and retained only as long as necessary for service operation.</p>
    <h2>Contact</h2><p>For questions about this policy, contact us at weiliking@hotmail.com</p>
    </body></html>"""


@app.get("/api/health")
async def health():
    ig_connected = getattr(app.state.ig_client, "connected", False)
    return {
        "status": "ok",
        "ig_mode": settings.ig_mode,
        "ig_connected": ig_connected,
    }
