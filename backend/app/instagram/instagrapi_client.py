import asyncio
import logging
from pathlib import Path
from instagrapi import Client as InstaClient
from app.instagram.base import InstagramClient, IncomingMessage, IncomingComment

logger = logging.getLogger(__name__)

# Max backoff: 10 minutes
MAX_BACKOFF = 600


class InstagrapiClient(InstagramClient):
    def __init__(
        self,
        username: str,
        password: str,
        session_file: str = "session.json",
        poll_interval: int = 20,
    ):
        self.username = username
        self.password = password
        self.session_file = Path(session_file)
        self.poll_interval = poll_interval
        self.cl = InstaClient()
        self.connected = False
        self._running = False
        self._consecutive_errors = 0
        self._processed_dm_ids: set[str] = set()
        self._processed_comment_ids: set[str] = set()
        self._poll_task: asyncio.Task | None = None

    def _login(self):
        """Login to Instagram, reusing session if available."""
        if self.session_file.exists():
            try:
                self.cl.load_settings(self.session_file)
                self.cl.login(self.username, self.password)
                logger.info("Logged in using saved session")
                return
            except Exception:
                logger.warning("Saved session invalid, doing fresh login")
        self.cl.login(self.username, self.password)
        self.cl.dump_settings(self.session_file)
        logger.info("Fresh login successful, session saved")

    def _relogin(self):
        """Force a fresh login, clearing old session."""
        logger.info("Attempting re-login...")
        if self.session_file.exists():
            self.session_file.unlink()
        self.cl = InstaClient()
        self.cl.login(self.username, self.password)
        self.cl.dump_settings(self.session_file)
        logger.info("Re-login successful")

    async def start_polling(self):
        """Start polling for new DMs and comments in a background loop."""
        self._running = True
        await asyncio.to_thread(self._login)
        self.connected = True
        logger.info(f"Starting poll loop (interval={self.poll_interval}s)")
        self._poll_task = asyncio.create_task(self._poll_loop())

    async def stop_polling(self):
        self._running = False
        if self._poll_task:
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass

    def _get_backoff(self) -> int:
        """Exponential backoff: poll_interval * 2^errors, capped at MAX_BACKOFF."""
        if self._consecutive_errors <= 0:
            return self.poll_interval
        backoff = min(self.poll_interval * (2 ** self._consecutive_errors), MAX_BACKOFF)
        return int(backoff)

    async def _poll_loop(self):
        while self._running:
            try:
                await self._check_dms()
                await self._check_comments()
                # Reset on success
                if self._consecutive_errors > 0:
                    logger.info("Poll recovered, back to normal interval")
                self._consecutive_errors = 0
            except Exception as e:
                self._consecutive_errors += 1
                backoff = self._get_backoff()
                error_msg = str(e)

                # Detect rate-limit / session issues (404, 429)
                if "404" in error_msg or "429" in error_msg:
                    logger.warning(
                        f"Instagram rate-limited (attempt {self._consecutive_errors}). "
                        f"Backing off {backoff}s before next poll."
                    )
                    # Try re-login after 3 consecutive failures
                    if self._consecutive_errors == 3:
                        try:
                            await asyncio.to_thread(self._relogin)
                            self._consecutive_errors = 0
                            logger.info("Re-login succeeded, resetting backoff")
                        except Exception as re_err:
                            logger.error(f"Re-login failed: {re_err}")
                else:
                    logger.error(f"Poll error (attempt {self._consecutive_errors}, next in {backoff}s): {e}")

            wait = self._get_backoff()
            await asyncio.sleep(wait)

    async def _check_dms(self):
        if not self._message_handler:
            return
        threads = await asyncio.to_thread(self.cl.direct_threads, amount=20)
        for thread in threads:
            for msg in thread.messages:
                if str(msg.id) in self._processed_dm_ids:
                    continue
                # Skip messages sent by us
                if str(msg.user_id) == str(self.cl.user_id):
                    self._processed_dm_ids.add(str(msg.id))
                    continue
                if msg.text:
                    incoming = IncomingMessage(
                        sender_id=str(msg.user_id),
                        sender_username=thread.users[0].username if thread.users else "",
                        message_id=str(msg.id),
                        text=msg.text,
                        timestamp=msg.timestamp.timestamp() if msg.timestamp else 0,
                    )
                    self._processed_dm_ids.add(str(msg.id))
                    try:
                        await self._message_handler(incoming)
                    except Exception as e:
                        logger.error(f"Error handling DM from {incoming.sender_username}: {e}")

    async def _check_comments(self):
        if not self._comment_handler:
            return
        try:
            user_id = self.cl.user_id
            medias = await asyncio.to_thread(self.cl.user_medias, user_id, amount=5)
            for media in medias:
                comments = await asyncio.to_thread(self.cl.media_comments, str(media.pk), amount=20)
                for comment in comments:
                    if str(comment.pk) in self._processed_comment_ids:
                        continue
                    # Skip our own comments
                    if str(comment.user.pk) == str(user_id):
                        self._processed_comment_ids.add(str(comment.pk))
                        continue
                    incoming = IncomingComment(
                        comment_id=str(comment.pk),
                        media_id=str(media.pk),
                        user_id=str(comment.user.pk),
                        username=comment.user.username,
                        text=comment.text,
                        timestamp=comment.created_at_utc.timestamp() if comment.created_at_utc else 0,
                    )
                    self._processed_comment_ids.add(str(comment.pk))
                    try:
                        await self._comment_handler(incoming)
                    except Exception as e:
                        logger.error(f"Error handling comment from {comment.user.username}: {e}")
        except Exception as e:
            logger.error(f"Comment check error: {e}")

    async def send_dm(self, user_id: str, text: str) -> bool:
        try:
            # Split long messages (Instagram DM limit ~1000 chars)
            chunks = [text[i:i+1000] for i in range(0, len(text), 1000)]
            for chunk in chunks:
                await asyncio.to_thread(
                    self.cl.direct_send, chunk, user_ids=[int(user_id)]
                )
            return True
        except Exception as e:
            logger.error(f"Failed to send DM to {user_id}: {e}")
            return False

    async def reply_to_comment(self, media_id: str, comment_id: str, text: str) -> bool:
        try:
            await asyncio.to_thread(
                self.cl.media_comment, media_id, text, replied_to_comment_id=int(comment_id)
            )
            return True
        except Exception as e:
            logger.error(f"Failed to reply to comment {comment_id}: {e}")
            return False
