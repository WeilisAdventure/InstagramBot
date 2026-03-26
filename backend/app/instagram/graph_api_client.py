import logging
import httpx
from app.instagram.base import InstagramClient

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.instagram.com/v25.0"


class GraphApiClient(InstagramClient):
    """Instagram client using official Graph API (requires Business account)."""

    def __init__(self, account_id: str, page_access_token: str):
        self.account_id = account_id
        self.token = page_access_token
        self.http = httpx.AsyncClient(timeout=30)

    async def start_polling(self):
        # Graph API uses webhooks, not polling. Webhook router handles incoming.
        logger.info("Graph API client initialized (webhook mode)")

    async def stop_polling(self):
        await self.http.aclose()

    async def send_dm(self, user_id: str, text: str) -> bool:
        chunks = [text[i:i+1000] for i in range(0, len(text), 1000)]
        for chunk in chunks:
            try:
                resp = await self.http.post(
                    f"{GRAPH_API_BASE}/{self.account_id}/messages",
                    params={"access_token": self.token},
                    json={
                        "recipient": {"id": user_id},
                        "message": {"text": chunk},
                    },
                )
                if resp.status_code == 429:
                    logger.warning("Rate limited by Instagram API")
                    return False
                resp.raise_for_status()
            except Exception as e:
                logger.error(f"Graph API send_dm error: {e}")
                return False
        return True

    async def reply_to_comment(self, media_id: str, comment_id: str, text: str) -> bool:
        try:
            resp = await self.http.post(
                f"{GRAPH_API_BASE}/{comment_id}/replies",
                params={"access_token": self.token},
                json={"message": text},
            )
            resp.raise_for_status()
            return True
        except Exception as e:
            logger.error(f"Graph API reply_to_comment error: {e}")
            return False
