"""Shared system prompt for all AI providers."""

from app.knowledge.loader import KNOWLEDGE_DIR
from app.knowledge.sections import load_sections, select_relevant_sections

SYSTEM_PROMPT_FILE = KNOWLEDGE_DIR / "system_prompt.md"

_FALLBACK_BASE = (
    "You are a friendly and professional customer service assistant. "
    "Reply concisely and match the language the customer uses."
)


def _load_base_prompt() -> str:
    try:
        if SYSTEM_PROMPT_FILE.exists():
            content = SYSTEM_PROMPT_FILE.read_text(encoding="utf-8").strip()
            if content:
                return content
    except Exception:
        pass
    return _FALLBACK_BASE


def build_system_prompt(
    preferences: list[str] | None = None,
    user_message: str = "",
    history: list[dict] | None = None,
) -> str:
    """Build the full system prompt.

    Args:
        preferences: long-term manager preferences applied to all replies.
        user_message: the customer's latest message; used to route which
            knowledge sections (pricing / coverage / sizes / schedule) are
            injected, so we don't burn 6-8K tokens on every call when only
            one section is actually relevant.
        history: recent conversation messages (chronological list of
            {role, content}); the last 2 are joined with the current
            message for routing, so short follow-ups like "yes" still
            inherit the topic from the prior turn.
    """
    prompt = _load_base_prompt()

    if preferences:
        rules = "\n".join(f"- {p}" for p in preferences if p.strip())
        if rules:
            prompt += (
                "\n\n## Manager Preferences (must follow)\n\n"
                "These are persistent style rules set by the manager. They "
                "override any conflicting guidance below.\n\n" + rules
            )

    sections = select_relevant_sections(user_message, history)
    if sections:
        section_text = load_sections(sections)
        if section_text:
            prompt += (
                "\n\n## Reference Knowledge\n\n"
                f"_(Loaded sections: {', '.join(sections)})_\n\n"
                f"{section_text}"
            )

    return prompt


def build_reply_directive(is_first: bool, for_draft: bool = False) -> str:
    """Build the per-call extra_prompt injected on top of the system prompt.

    Args:
        is_first: True if this is the very first message in the conversation.
        for_draft: True for the manual generate-reply path (manager sees a
            Chinese draft before sending). False for the auto-reply path
            (reply goes directly to the customer in their language).
    """
    parts: list[str] = []

    # Language override — only for manager draft review, not for auto-reply.
    # The system prompt says "reply in the customer's language"; for drafts we
    # override that so the manager always reviews in Chinese.
    if for_draft:
        parts.append(
            "LANGUAGE OVERRIDE: Ignore the language rule in the system prompt above. "
            "Reply in Simplified Chinese ONLY. "
            "This is a draft for the manager to review before sending; "
            "the system will translate to the customer's language at send time."
        )

    if is_first:
        parts.append(
            "This is the customer's FIRST message. "
            "You MUST start your reply by briefly introducing yourself as Achilles Chen (A.C.), "
            "Manager at FleetNow Delivery. "
            "Then ask whether they need personal or business delivery "
            "(pricing differs by monthly volume). "
            "Emphasize our unlimited-distance same-day flat-rate service."
        )
    else:
        parts.append(
            "This is a FOLLOW-UP message — NOT the first. "
            "STRICT RULES — read the conversation history before writing:\n"
            "- Do NOT introduce yourself again.\n"
            "- Do NOT list FleetNow advantages again (flat-rate, same-day, no distance limit, etc.). "
            "If ANY prior turn already contains a bullet list of advantages, "
            "you MUST NOT produce another bullet list — use plain prose instead.\n"
            "- Do NOT ask a question that has already been asked in any prior turn.\n"
            "Read the history carefully and respond ONLY to the customer's latest message."
        )

    return "\n\n".join(parts)
