from app.instagram.base import InstagramClient
from app.instagram.instagrapi_client import InstagrapiClient
from app.instagram.graph_api_client import GraphApiClient
from app.config import Settings


def create_instagram_client(settings: Settings) -> InstagramClient:
    if settings.ig_mode == "instagrapi":
        return InstagrapiClient(
            username=settings.ig_username,
            password=settings.ig_password,
            session_file=settings.ig_session_file,
            poll_interval=settings.poll_interval,
        )
    elif settings.ig_mode == "graph_api":
        return GraphApiClient(
            account_id=settings.instagram_account_id,
            page_access_token=settings.instagram_page_access_token,
        )
    raise ValueError(f"Unknown IG mode: {settings.ig_mode}")
