from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "knowledge_base"


def load_knowledge_base() -> str:
    """Load all .md files from knowledge_base/ directory and concatenate them."""
    parts: list[str] = []
    if not KNOWLEDGE_DIR.exists():
        return ""
    for md_file in sorted(KNOWLEDGE_DIR.glob("*.md")):
        content = md_file.read_text(encoding="utf-8").strip()
        if content:
            parts.append(content)
    return "\n\n---\n\n".join(parts)
