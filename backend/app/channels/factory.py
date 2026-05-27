"""Build the set of enabled channel clients from app settings.

Returns a `dict[channel_name -> ChannelClient]` that the rest of the app
treats as opaque — `MessageHandler` dispatches on `IncomingMessage.channel`
and looks up the outbound client in this dict.

Channels are gated by config: IG always present (the system was IG-only
historically), Tidio only when `tidio_enabled=true` AND credentials are set.
Each channel's failure is isolated — if Tidio creds are bad we still ship
IG without complaint.
"""
import logging

from app.config import Settings
from app.channels.base import ChannelClient
from app.channels.instagram.factory import create_instagram_client
from app.channels.tidio.base import TidioClient

logger = logging.getLogger(__name__)


def create_channel_clients(settings: Settings) -> dict[str, ChannelClient]:
    clients: dict[str, ChannelClient] = {}

    # Instagram — always created. Connection failures are tolerated at
    # start_polling time, not here.
    clients["instagram"] = create_instagram_client(settings)

    # Tidio — opt-in via env. Missing creds with enabled=True is a
    # config error worth logging but not crashing the boot.
    if settings.tidio_enabled:
        if settings.tidio_client_id and settings.tidio_client_secret:
            clients["tidio"] = TidioClient(
                client_id=settings.tidio_client_id,
                client_secret=settings.tidio_client_secret,
                operator_id=settings.tidio_operator_id,
                api_base=settings.tidio_api_base,
            )
            logger.info("Tidio channel enabled")
        else:
            logger.warning(
                "tidio_enabled=true but tidio_client_id/tidio_client_secret "
                "are empty — Tidio NOT registered."
            )

    return clients
