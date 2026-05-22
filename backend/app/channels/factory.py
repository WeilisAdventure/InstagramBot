"""Build the set of enabled channel clients from app settings.

Returns a `dict[channel_name -> ChannelClient]` that the rest of the app
treats as opaque — `MessageHandler` dispatches on `IncomingMessage.channel`
and looks up the outbound client in this dict.

PR 1 only wires Instagram. New channels (Tidio, ...) get added as additional
entries in this factory in subsequent PRs; the public shape doesn't change.
"""
from app.config import Settings
from app.channels.base import ChannelClient
from app.channels.instagram.factory import create_instagram_client


def create_channel_clients(settings: Settings) -> dict[str, ChannelClient]:
    clients: dict[str, ChannelClient] = {}
    ig = create_instagram_client(settings)
    clients["instagram"] = ig
    return clients
