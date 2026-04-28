"""Keyword-based knowledge relevance filter for the legacy Q&A table.

Selects the most relevant Q&A entries based on keyword overlap with the
user's message. Falls back to the first MAX_ENTRIES entries when no
keywords match, so the AI always has some context.

Notes:
- The bulk of the FleetNow knowledge now lives as section markdown files
  routed by ``app.knowledge.sections``; this module only handles the
  ``knowledge_entries`` DB table (managed via the Knowledge UI).
- Pre-translation to Chinese was removed when the KB switched to English.
  Keyword matching is plain substring against lowercased text, which works
  for English directly and for Chinese (jieba still segments CJK input).
- ``ai`` parameter is kept for backward compatibility but no longer used.
"""

import logging

import jieba

logger = logging.getLogger(__name__)

MAX_ENTRIES = 30  # max Q&A pairs sent to the AI
MAX_CHARS = 12000  # rough cap to stay under Anthropic 30K input-tokens/min


async def filter_relevant(
    entries: list[dict],
    user_message: str,
    ai=None,  # kept for backward compatibility; unused
    max_entries: int = MAX_ENTRIES,
    max_chars: int = MAX_CHARS,
) -> list[dict]:
    """Return the most relevant Q&A entries for *user_message*.

    Each entry is ``{"question": str, "answer": str}``.
    """
    if not entries:
        return []

    query = (user_message or "").lower()

    # jieba.lcut handles Chinese segmentation and falls back to whitespace
    # tokenisation for English. Keep tokens >= 2 chars to drop noise.
    keywords = {w for w in jieba.lcut(query) if len(w) >= 2 and w.strip()}
    if not keywords:
        return entries[:max_entries]

    scored: list[tuple[int, int, dict]] = []
    for idx, e in enumerate(entries):
        text = f"{e['question']} {e['answer']}".lower()
        score = sum(1 for kw in keywords if kw in text)
        scored.append((score, idx, e))

    scored.sort(key=lambda x: (-x[0], x[1]))

    result: list[dict] = []
    total = 0
    for _, _, e in scored[:max_entries]:
        size = len(e["question"]) + len(e["answer"])
        if total + size > max_chars and result:
            break
        result.append(e)
        total += size
    return result
