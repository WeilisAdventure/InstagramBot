from app.instagram.base import IncomingMessage


def parse_messaging_events(data: dict) -> list[IncomingMessage]:
    """Parse Meta webhook payload into IncomingMessage objects."""
    messages = []
    for entry in data.get("entry", []):
        for event in entry.get("messaging", []):
            # Skip echo messages
            if event.get("message", {}).get("is_echo"):
                continue
            sender_id = event.get("sender", {}).get("id", "")
            msg_data = event.get("message", {})
            if not msg_data:
                continue
            messages.append(
                IncomingMessage(
                    sender_id=sender_id,
                    sender_username="",  # Not available in webhook payload
                    message_id=msg_data.get("mid", ""),
                    text=msg_data.get("text"),
                    timestamp=float(event.get("timestamp", 0)),
                )
            )
    return messages
