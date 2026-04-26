"""Distil long-term manager preferences from per-call prompt hints.

Called asynchronously after a manual generate-reply request, so any latency
or LLM error never blocks the user-facing response. Uses the existing AI
provider; falls back to a no-op on any failure.
"""

import json
import logging
import re

from sqlalchemy import select

from app.ai.base import AIProvider
from app.database import async_session
from app.models.preference import ManagerPreference

logger = logging.getLogger(__name__)

EXTRACT_PROMPT = """\
You analyse short manager-supplied hints used when generating an Instagram
reply, and decide whether they reveal a LONG-TERM preference worth remembering.

Long-term preferences describe consistent style/tone/policy choices that the
manager would likely want applied to ALL future replies (e.g. "use 您 not 你",
"never use exclamation marks", "always ask for monthly volume before quoting").

Per-message ad hoc instructions (e.g. "shorter", "translate this", "answer his
specific question about Tuesday") are NOT preferences — discard them.

Existing preferences (do not duplicate, do not contradict):
{existing}

New hint from the manager:
"{prompt}"

Output STRICT JSON: {{"preferences": ["<one rule>", "<another rule>"]}}
- Each rule is ONE short imperative sentence in Simplified Chinese, ≤ 25 chars.
- Return [] if the hint is ad hoc / not generalisable / already covered.
- No markdown, no commentary, JSON only.
"""


async def extract_preferences(ai: AIProvider, user_prompt: str) -> list[str]:
    """Run the AI to extract long-term rules. Returns [] on any failure."""
    if not user_prompt or not user_prompt.strip():
        return []

    # Pull current active preferences so the model can de-dupe
    async with async_session() as db:
        existing_q = await db.execute(
            select(ManagerPreference).where(ManagerPreference.is_active == True)
        )
        existing = [p.content for p in existing_q.scalars().all()]

    existing_block = "\n".join(f"- {p}" for p in existing) if existing else "(none)"
    prompt = EXTRACT_PROMPT.format(existing=existing_block, prompt=user_prompt.strip())

    try:
        # Use generate_reply with no system prompt baggage by going through
        # translate_message-style direct call would be cleaner, but our
        # AIProvider abstract only has translate_* and generate_reply.
        # generate_reply respects the provider's stored system prompt, which
        # would pollute things, so we call the underlying client where we can.
        text = await _raw_complete(ai, prompt)
    except Exception as e:
        logger.warning(f"Preference extraction call failed: {e}")
        return []

    try:
        # Tolerate minor wrapping
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            return []
        data = json.loads(m.group(0))
        prefs = data.get("preferences") or []
        return [p.strip() for p in prefs if isinstance(p, str) and p.strip()]
    except Exception as e:
        logger.warning(f"Preference extraction JSON parse failed: {e} (raw: {text[:200]})")
        return []


async def _raw_complete(ai: AIProvider, prompt: str) -> str:
    """Best-effort raw completion that bypasses the manager system prompt."""
    # Each provider stores its underlying client/model differently; do a
    # narrow set of probes rather than expand the abstract interface.
    if hasattr(ai, "client") and hasattr(getattr(ai, "client"), "messages"):
        # Anthropic
        resp = await ai.client.messages.create(
            model=getattr(ai, "model", "claude-haiku-4-20250514"),
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text
    if hasattr(ai, "client") and hasattr(getattr(ai, "client"), "chat"):
        # OpenAI
        resp = await ai.client.chat.completions.create(
            model=getattr(ai, "model", "gpt-4o-mini"),
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.choices[0].message.content or ""
    # Google or unknown — fall back to translate_message hack: ask the
    # provider to "translate" the prompt; not ideal but most providers will
    # just answer. Skip: simpler to give up.
    raise RuntimeError("Unsupported provider for raw completion")


async def learn_from_prompt(ai: AIProvider, user_prompt: str) -> int:
    """Extract + persist new preferences. Returns count of new rows added."""
    prefs = await extract_preferences(ai, user_prompt)
    if not prefs:
        return 0

    added = 0
    async with async_session() as db:
        # Avoid storing exact duplicates of existing active rules
        existing_q = await db.execute(
            select(ManagerPreference).where(ManagerPreference.is_active == True)
        )
        existing = {p.content for p in existing_q.scalars().all()}
        for content in prefs:
            if content in existing:
                continue
            db.add(
                ManagerPreference(
                    content=content,
                    source_prompt=user_prompt[:500],
                    is_active=True,
                )
            )
            existing.add(content)
            added += 1
        if added:
            await db.commit()
    if added:
        logger.info(f"Learned {added} new manager preference(s) from prompt: {user_prompt[:80]}")
    return added
