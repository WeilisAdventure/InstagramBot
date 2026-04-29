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
        self.username = ""
        self.ig_id = ""

    async def start_polling(self):
        """Graph API uses webhooks — no polling needed.
        Verify token works by fetching account info."""
        if not self.token:
            logger.warning("No Page Access Token configured. Graph API client inactive.")
            return

        try:
            # Fetch account info via /me on Instagram Graph API
            resp = await self.http.get(
                f"{GRAPH_API_BASE}/me",
                params={
                    "fields": "id,name,username",
                    "access_token": self.token,
                },
            )
            if resp.status_code != 200:
                logger.error(f"Graph API token verification failed ({resp.status_code}): {resp.text}")
                self.connected = False
                return

            data = resp.json()
            username = data.get("username", "") or data.get("name", "")
            ig_id = data.get("id", "")

            if not username:
                logger.error(f"Could not determine Instagram account info")
                self.connected = False
                return

            self.username = username
            self.ig_id = ig_id
            logger.info(f"Graph API connected: @{self.username} (ID: {self.ig_id})")
            self.connected = True
        except Exception as e:
            logger.error(f"Graph API token verification failed: {e}")
            self.connected = False

    async def stop_polling(self):
        await self.http.aclose()

    async def send_dm(self, user_id: str, text: str, tag: str | None = None) -> bool:
        """Send a DM via Instagram Messaging API.

        Endpoint: POST /me/messages
        Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api

        tag: optional messaging tag e.g. "HUMAN_AGENT" to extend the reply
             window beyond 24 hours (requires Meta app review approval).
        """
        chunks = [text[i:i + 1000] for i in range(0, len(text), 1000)]
        for chunk in chunks:
            try:
                payload: dict = {
                    "recipient": {"id": user_id},
                    "message": {"text": chunk},
                    "messaging_type": "RESPONSE",
                }
                if tag:
                    payload["tag"] = tag
                resp = await self.http.post(
                    f"{GRAPH_API_BASE}/me/messages",
                    params={"access_token": self.token},
                    json=payload,
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

    async def get_media_permalink(self, media_id: str) -> str | None:
        """Fetch the public permalink for a media id via Graph API.

        Returns the URL string or None if the lookup fails (e.g. expired
        token, deleted post, missing scope).
        """
        if not media_id or not self.token:
            return None
        try:
            resp = await self.http.get(
                f"{GRAPH_API_BASE}/{media_id}",
                params={"fields": "permalink", "access_token": self.token},
            )
            if resp.status_code != 200:
                logger.warning(
                    f"get_media_permalink failed ({resp.status_code}) for {media_id}: {resp.text[:200]}"
                )
                return None
            return resp.json().get("permalink")
        except Exception as e:
            logger.warning(f"get_media_permalink error for {media_id}: {e}")
            return None

    async def get_user_profile(self, user_id: str) -> dict | None:
        """Fetch user profile info (for getting username from webhook sender_id).

        Note: For Instagram-scoped user IDs (IGSID) from messaging webhooks,
        only 'name' and 'profile_pic' fields are available (not 'username').
        We try username first, then fall back to name-only fields.
        """
        # Try with username field first (works for some account types)
        for fields in ["username,name,profile_picture_url", "name,profile_pic"]:
            try:
                resp = await self.http.get(
                    f"{GRAPH_API_BASE}/{user_id}",
                    params={
                        "fields": fields,
                        "access_token": self.token,
                    },
                )
                if resp.status_code == 200:
                    data = resp.json()
                    # Normalize field names for the caller
                    return {
                        "username": data.get("username", "") or data.get("name", ""),
                        "name": data.get("name", ""),
                        "profile_pic": data.get("profile_picture_url", "") or data.get("profile_pic", ""),
                    }
            except Exception:
                continue
        logger.warning(f"Could not fetch profile for user {user_id}")
        return None
