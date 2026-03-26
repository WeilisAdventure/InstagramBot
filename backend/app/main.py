import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.ai.factory import create_ai_provider
from app.instagram.factory import create_instagram_client
from app.services.message_handler import MessageHandler
from app.services.translator import TranslatorService
from app.api import dashboard, rules, simulate, conversations, knowledge
from app.api import settings as settings_api

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
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

    # Start polling if in instagrapi mode
    if settings.ig_mode == "instagrapi" and settings.ig_username:
        logger.info("Starting Instagram polling...")
        try:
            await ig.start_polling()
        except Exception as e:
            logger.error(f"Instagram login failed: {e}")
            logger.warning(
                "Bot started WITHOUT Instagram connection. "
                "Dashboard and API are available. "
                "Fix your IG credentials or complete the challenge, then restart."
            )

    yield

    # Shutdown
    logger.info("Stopping Instagram client...")
    await ig.stop_polling()


app = FastAPI(title="Instagram Bot", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API routes
app.include_router(dashboard.router)
app.include_router(rules.router)
app.include_router(simulate.router)
app.include_router(conversations.router)
app.include_router(knowledge.router)
app.include_router(settings_api.router)

# Mount webhook (for graph_api mode)
if settings.ig_mode == "graph_api":
    from app.webhook.router import router as webhook_router
    app.include_router(webhook_router)


@app.get("/api/health")
async def health():
    ig_connected = getattr(app.state.ig_client, "connected", False)
    return {
        "status": "ok",
        "ig_mode": settings.ig_mode,
        "ig_connected": ig_connected,
    }
