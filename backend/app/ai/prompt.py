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
