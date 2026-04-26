"""Keyword-based knowledge relevance filter with Chinese word segmentation.

Selects the most relevant Q&A entries based on keyword overlap with
the user's message.  Since the knowledge base is in Chinese but
incoming Instagram messages are usually English, the message is first
translated to Chinese (when an AI provider is supplied) before jieba
tokenisation, so keyword matching actually has a chance.

Falls back to the first MAX_ENTRIES entries when no keywords match,
so the AI always has some context.
"""

import logging
import re

import jieba

logger = logging.getLogger(__name__)

MAX_ENTRIES = 30  # max Q&A pairs sent to the AI
MAX_CHARS = 12000  # rough cap to stay under Anthropic 30K input-tokens/min

_CJK_RE = re.compile(r"[\u4e00-\u9fff\u3400-\u4dbf]")


def _has_cjk(text: str) -> bool:
    return bool(_CJK_RE.search(text or ""))


async def _translate_to_chinese(ai, text: str) -> str:
    """Translate *text* to Chinese using the AI provider; return original on failure."""
    if not ai or not text.strip():
        return text
    try:
        result = await ai.translate_message(text)
        if result and result.get("source_lang") == "en":
            return result.get("translated") or text
        return text
    except Exception as e:
        logger.warning(f"Translation for keyword matching failed: {e}")
        return text


async def filter_relevant(
    entries: list[dict],
    user_message: str,
    ai=None,
    max_entries: int = MAX_ENTRIES,
    max_chars: int = MAX_CHARS,
) -> list[dict]:
    """Return the most relevant knowledge entries for *user_message*.

    Each entry is {"question": str, "answer": str}.
    If *ai* is provided and the message has no CJK characters, it is
    translated to Chinese first so jieba tokenisation matches the
    Chinese knowledge base.
    """
    if not entries:
        return []

    query = user_message or ""
    if ai is not None and not _has_cjk(query):
        query = await _translate_to_chinese(ai, query)

    # Tokenise the query using jieba (handles Chinese + English)
    keywords = {w.lower() for w in jieba.lcut(query) if len(w) >= 2}
    if not keywords:
        return entries[:max_entries]

    # Score each entry by how many query keywords appear in Q or A
    scored: list[tuple[int, int, dict]] = []
    for idx, e in enumerate(entries):
        text = f"{e['question']} {e['answer']}".lower()
        score = sum(1 for kw in keywords if kw in text)
        scored.append((score, idx, e))

    # Sort by score desc, then original order
    scored.sort(key=lambda x: (-x[0], x[1]))

    # Take top entries, respecting char limit
    result: list[dict] = []
    total = 0
    for _, _, e in scored[:max_entries]:
        size = len(e["question"]) + len(e["answer"])
        if total + size > max_chars and result:
            break
        result.append(e)
        total += size

    return result
