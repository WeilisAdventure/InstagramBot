"""Keyword-based knowledge relevance filter with Chinese word segmentation.

Selects the most relevant Q&A entries based on keyword overlap with
the user's message.  Falls back to the first MAX_ENTRIES entries when
no keywords match, so the AI always has some context.
"""

import jieba

MAX_ENTRIES = 20  # max Q&A pairs sent to the AI
MAX_CHARS = 15000  # rough cap to stay under token limits


def filter_relevant(
    entries: list[dict],
    user_message: str,
    max_entries: int = MAX_ENTRIES,
    max_chars: int = MAX_CHARS,
) -> list[dict]:
    """Return the most relevant knowledge entries for *user_message*.

    Each entry is {"question": str, "answer": str}.
    """
    if len(entries) <= max_entries:
        return entries

    # Tokenise the query using jieba (handles Chinese + English)
    keywords = {w.lower() for w in jieba.lcut(user_message) if len(w) >= 2}
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
