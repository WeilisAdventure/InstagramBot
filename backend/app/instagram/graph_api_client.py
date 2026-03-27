import logging
import httpx
from app.instagram.base import InstagramClient

logger = logging.getLogger(__name__)

GRAPH_API_BASE = "https://graph.instagram.com/v21.0"


class GraphApiClient(InstagramClient):
    """Instagram client using official Graph API + Webhooks.

    Requires:
    - Instagram Business/Creator account connected to a Facebook Page
    - Facebook App with Instagram Product enabled
    - Page Access Token with required permissions
    """

    def __init__(self, account_id: str, page_access_token: str):
        self.account_id = account_id
        self.token = page_access_token
        self.http = httpx.AsyncClient(timeout=30)
        self.connected = False

    async def start_polling(self):
        """Graph API uses webhooks — no polling needed.
        Verify token works by fetching account info."""
        if not self.token:
            logger.warning("No Page Access Token configured. Graph API client inactive.")
            return

        try:
            resp = await self.http.get(
                f"{GRAPH_API_BASE}/me",
                params={
                    "fields": "id,name,username",
                    "access_token": self.token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(f"Graph API connected: {data.get('username', data.get('name', 'unknown'))} (ID: {data.get('id')})")
            self.connected = True
        except Exception as e:
            logger.error(f"Graph API token verification failed: {e}")
            self.connected = False

    async def stop_polling(self):
        await self.http.aclose()

    async def send_dm(self, user_id: str, text: str) -> bool:
        """Send a DM via Instagram Messaging API.

        Endpoint: POST /me/messages
        Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
        """
        chunks = [text[i:i + 1000] for i in range(0, len(text), 1000)]
        for chunk in chunks:
            try:
                resp = await self.http.post(
                    f"{GRAPH_API_BASE}/me/messages",
                    params={"access_token": self.token},
                    json={
                        "recipient": {"id": user_id},
                        "message": {"text": chunk},
                    },
                )
                if resp.status_code == 429:
                    logger.warning("Rate limited by Instagram API")
                    return False
                if resp.status_code != 200:
                    logger.error(f"Send DM failed ({resp.status_code}): {resp.text}")
                    return False
            except Exception as e:
                logger.error(f"Graph API send_dm error: {e}")
                return False
        return True

    async def reply_to_comment(self, media_id: str, comment_id: str, text: str) -> bool:
        """Reply to a comment using Instagram Graph API.

        Endpoint: POST /{comment-id}/replies
        """
        try:
            resp = await self.http.post(
                f"{GRAPH_API_BASE}/{comment_id}/replies",
                params={"access_token": self.token},
                json={"message": text},
            )
            if resp.status_code != 200:
                logger.error(f"Reply to comment failed ({resp.status_code}): {resp.text}")
                return False
            return True
        except Exception as e:
            logger.error(f"Graph API reply_to_comment error: {e}")
            return False

    async def get_user_profile(self, user_id: str) -> dict | None:
        """Fetch user profile info (for getting username from webhook sender_id)."""
        try:
            resp = await self.http.get(
                f"{GRAPH_API_BASE}/{user_id}",
                params={
                    "fields": "username,name",
                    "access_token": self.token,
                },
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"Get user profile error: {e}")
            return None
