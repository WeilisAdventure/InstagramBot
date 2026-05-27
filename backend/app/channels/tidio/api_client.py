"""Thin HTTP client around Tidio's OpenAPI.

Tidio doesn't use OAuth token exchange — every request carries two static
headers (`X-Tidio-Openapi-Client-Id` + `X-Tidio-Openapi-Client-Secret`)
plus an Accept header pinning the API version.

Docs (auth):   https://developers.tidio.com/docs/openapi-authorization
Docs (reply):  https://developers.tidio.com/reference/post_tickets-ticketid-reply
Docs (contact):https://developers.tidio.com/reference/get_contacts-contactid
"""
from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class TidioApiClient:
    """Stateless HTTP wrapper. One instance per bot — reuses an httpx
    AsyncClient so connections pool across calls."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        operator_id: str = "",
        api_base: str = "https://api.tidio.com",
        timeout_seconds: float = 10.0,
    ):
        self.client_id = client_id
        self.client_secret = client_secret
        self.operator_id = operator_id
        self.api_base = api_base.rstrip("/")
        self._http: httpx.AsyncClient | None = None
        self._timeout = timeout_seconds

    def _ensure_http(self) -> httpx.AsyncClient:
        # Lazy so tests can construct the client without opening sockets.
        if self._http is None:
            self._http = httpx.AsyncClient(
                base_url=self.api_base,
                timeout=self._timeout,
                headers={
                    "X-Tidio-Openapi-Client-Id": self.client_id,
                    "X-Tidio-Openapi-Client-Secret": self.client_secret,
                    "Accept": "application/json; version=1",
                    "Content-Type": "application/json",
                },
            )
        return self._http

    async def aclose(self):
        if self._http is not None:
            await self._http.aclose()
            self._http = None

    async def reply_to_ticket(
        self,
        ticket_id: str,
        content: str,
        *,
        message_type: str = "public",
    ) -> bool:
        """POST /tickets/{ticket_id}/reply as an operator.

        Returns True on 2xx, False otherwise. Failures are logged with
        enough context to debug but don't raise — the caller (handler)
        prefers to record an error message in the conversation than crash
        the request.
        """
        if not ticket_id:
            logger.error("reply_to_ticket called with empty ticket_id")
            return False
        body: dict[str, Any] = {
            "author_type": "operator",
            "content": content,
            "message_type": message_type,
        }
        if self.operator_id:
            body["operator_id"] = self.operator_id

        http = self._ensure_http()
        try:
            resp = await http.post(f"/tickets/{ticket_id}/reply", json=body)
        except httpx.HTTPError as e:
            logger.error(f"Tidio reply HTTP error for ticket {ticket_id}: {e}")
            return False

        if resp.status_code >= 400:
            logger.error(
                f"Tidio reply failed for ticket {ticket_id}: "
                f"{resp.status_code} {resp.text[:300]}"
            )
            return False
        return True

    async def get_contact(self, contact_id: str) -> dict | None:
        """GET /contacts/{contact_id}. Returns None on any error (caller
        treats absence as a soft-fail and skips the profile backfill)."""
        if not contact_id:
            return None
        http = self._ensure_http()
        try:
            resp = await http.get(f"/contacts/{contact_id}")
        except httpx.HTTPError as e:
            logger.warning(f"Tidio get_contact HTTP error for {contact_id}: {e}")
            return None
        if resp.status_code >= 400:
            logger.warning(
                f"Tidio get_contact failed for {contact_id}: "
                f"{resp.status_code} {resp.text[:200]}"
            )
            return None
        try:
            return resp.json()
        except ValueError:
            return None
