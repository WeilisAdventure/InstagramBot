"""Webhook idempotency log. One row per delivered webhook_id.

Tidio's docs explicitly say webhooks can be delivered out of order and
duplicated (exponential backoff, up to 9 retries). We use this table as a
dedup gate: if `webhook_id` is already here, the router returns 200 OK
without re-processing.

Kept channel-scoped so future webhook sources (Stripe, Twilio, ...) can
reuse the same shape without colliding on UUID-space.
"""
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    # Composite PK: (channel, webhook_id). Channel scoping means a future
    # source can use the same UUID by coincidence without colliding.
    channel: Mapped[str] = mapped_column(String(20), primary_key=True)
    webhook_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    received_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # For periodic cleanup of old rows. We don't auto-prune in PR 4;
        # a future cron / endpoint can DELETE WHERE received_at < now()-30d.
        Index("ix_webhook_events_received_at", "received_at"),
    )
