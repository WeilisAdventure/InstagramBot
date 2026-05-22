import time
from app.instagram.base import IncomingMessage, IncomingComment, Attachment


def parse_messaging_events(data: dict) -> list[IncomingMessage]:
    """Parse Meta webhook payload into IncomingMessage objects.

    Instagram webhook DM payload structure:
    {
      "object": "instagram",
      "entry": [{
        "id": "<IGID>",
        "time": 1234567890,
        "messaging": [{
          "sender": {"id": "123"},
          "recipient": {"id": "456"},
          "timestamp": 1234567890,
          "message": {
            "mid": "msg_id",
            "text": "Hello"
          }
        }]
      }]
    }
    """
    messages = []
    for entry in data.get("entry", []):
        for event in entry.get("messaging", []):
            # Skip echo messages (messages sent by us)
            if event.get("message", {}).get("is_echo"):
                continue
            sender_id = event.get("sender", {}).get("id", "")
            msg_data = event.get("message", {})
            if not msg_data:
                continue
            text = msg_data.get("text")
            attachments: list[Attachment] = []
            for att in msg_data.get("attachments", []) or []:
                url = (att.get("payload") or {}).get("url", "")
                a_type = att.get("type", "")
                if url and a_type:
                    attachments.append(Attachment(type=a_type, url=url))
            if not text and not attachments:
                continue
            messages.append(
                IncomingMessage(
                    sender_id=sender_id,
                    sender_username="",  # Not available in webhook; fetched later if needed
                    message_id=msg_data.get("mid", ""),
                    text=text,
                    timestamp=float(event.get("timestamp", 0)),
                    attachments=attachments,
                )
            )
    return messages


def parse_comment_events(data: dict) -> list[IncomingComment]:
    """Parse Meta webhook payload into IncomingComment objects.

    Instagram webhook comment payload structure:
    {
      "object": "instagram",
      "entry": [{
        "id": "<IGID>",
        "time": 1234567890,
        "changes": [{
          "field": "comments",
          "value": {
            "id": "comment_id",
            "text": "Great post!",
            "from": {
              "id": "user_id",
              "username": "username"
            },
            "media": {
              "id": "media_id"
            }
          }
        }]
      }]
    }
    """
    comments = []
    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "comments":
                continue
            value = change.get("value", {})
            from_data = value.get("from", {})
            media_data = value.get("media", {})

            comment_id = value.get("id", "")
            if not comment_id:
                continue

            comments.append(
                IncomingComment(
                    comment_id=comment_id,
                    media_id=media_data.get("id", ""),
                    user_id=from_data.get("id", ""),
                    username=from_data.get("username", ""),
                    text=value.get("text", ""),
                    timestamp=float(entry.get("time", time.time())),
                )
            )
    return comments
