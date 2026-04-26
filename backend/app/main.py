import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from app.config import settings
from app.database import init_db
from app.ai.factory import create_ai_provider
from app.instagram.factory import create_instagram_client
from app.services.message_handler import MessageHandler
from app.services.translator import TranslatorService
from app.api import auth, dashboard, rules, simulate, conversations, knowledge, preferences
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

    logger.info(f"Creating Instagram client: {settings.ig_mode}")
    ig = create_instagram_client(settings)
    app.state.ig_client = ig

    handler = MessageHandler(ai, ig, reply_delay=settings.reply_delay_seconds)
    app.state.message_handler = handler

    translator = TranslatorService(ai)
    app.state.translator = translator

    # Set up handlers for polling mode
    ig.set_message_handler(handler.handle_dm)
    ig.set_comment_handler(handler.handle_comment)

    # Start client (polling for instagrapi, token verify for graph_api)
    try:
        await ig.start_polling()
        if settings.ig_mode == "graph_api":
            logger.info("Graph API mode: webhooks will handle incoming messages/comments")
    except Exception as e:
        logger.error(f"Instagram client init failed: {e}")
        logger.warning(
            "Bot started WITHOUT Instagram connection. "
            "Dashboard and API are available. "
            "Fix your credentials, then restart."
        )

    yield

    # Shutdown
    logger.info("Stopping Instagram client...")
    await ig.stop_polling()


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
app.include_router(simulate.router)
app.include_router(conversations.router)
app.include_router(knowledge.router)
app.include_router(settings_api.router)
app.include_router(preferences.router)

# Mount webhook (always available, primary for graph_api mode)
app.include_router(webhook_router)


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
