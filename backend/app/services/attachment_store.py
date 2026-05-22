"""Persist webhook media attachments to local disk.

Instagram CDN URLs in webhook payloads are short-lived (signed, expire in
minutes to hours), so we download them immediately and serve our own copy
under /media/attachments/<uuid>.<ext>. UUID filenames are unguessable, so
the static mount doesn't need auth — the URL itself is the capability.
"""
from __future__ import annotations
import logging
import mimetypes
import uuid
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Repo layout: <repo>/backend/app/services/attachment_store.py
# We want <repo>/backend/media/attachments
_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "media" / "attachments"

_EXT_BY_MIME = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "video/mp4": ".mp4",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
}


def _ext_for(mime: str, fallback_type: str) -> str:
    mime = (mime or "").split(";")[0].strip().lower()
    if mime in _EXT_BY_MIME:
        return _EXT_BY_MIME[mime]
    guess = mimetypes.guess_extension(mime) if mime else None
    if guess:
        return guess
    # last resort by attachment kind
    return {"image": ".jpg", "video": ".mp4", "audio": ".m4a"}.get(fallback_type, ".bin")


async def download_attachment(remote_url: str, att_type: str) -> dict | None:
    """Download `remote_url` to MEDIA_ROOT, return {"type", "url"} for DB.

    Returns None on failure (caller decides whether to skip or keep the
    original URL — for IG that's usually pointless, the URL will be dead
    by the time anyone looks).
    """
    if not remote_url:
        return None
    _MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            r = await client.get(remote_url)
            r.raise_for_status()
            mime = (r.headers.get("content-type", "") or "").split(";")[0].strip().lower()
            ext = _ext_for(mime, att_type)
            fname = f"{uuid.uuid4().hex}{ext}"
            (_MEDIA_ROOT / fname).write_bytes(r.content)
            # IG sometimes labels things `ig_post` / `share` / `story_mention`
            # but the actual content is just a jpg/mp4. Reclassify by mime so
            # the frontend can render an <img> or <video> instead of a tag.
            if mime.startswith("image/"):
                kind = "image"
            elif mime.startswith("video/"):
                kind = "video"
            elif mime.startswith("audio/"):
                kind = "audio"
            else:
                kind = att_type
            return {"type": kind, "url": f"/media/attachments/{fname}"}
    except Exception as e:
        logger.warning(f"Attachment download failed for {remote_url[:80]}: {e}")
        return None
