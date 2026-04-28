"""Intent-based section routing for the FleetNow knowledge base.

The knowledge base is split into 4 logical sections (pricing, coverage,
sizes, schedule). Instead of stuffing all of them into every system
prompt (~6-8K tokens), we inspect the customer message and inject only
the section(s) the question is actually about.
"""

import re
from pathlib import Path

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "knowledge_base"

# Canadian FSA pattern (3 chars: letter-digit-letter, used in the entire KB).
_POSTAL_RE = re.compile(r"\b[A-Za-z]\d[A-Za-z]\b")

# Keyword → section mapping. Matched as case-insensitive substrings; designed
# to handle both English customer messages and Chinese manager hints.
_INTENTS: dict[str, list[str]] = {
    "pricing": [
        # English
        "price", "pricing", "cost", "quote", "fee", "rate", "charge", "$",
        "dollar", "how much", "how many", "expensive", "cheap", "afford",
        # Chinese
        "价格", "价钱", "费用", "收费", "多少钱", "报价", "贵", "便宜", "划算",
    ],
    "coverage": [
        # English
        "deliver to", "ship to", "shipping to", "send to", "service area",
        "available in", "cover", "coverage", "do you go", "do you ship",
        "do you deliver", "service", "postal", "fsa", "zone",
        # Chinese
        "送到", "送货", "覆盖", "范围", "服务区", "区域", "能送", "可以送", "邮编",
    ],
    "sizes": [
        # English
        "size", "weight", "dimension", "dimensions", "lb", "lbs", "pound",
        "kg", "kilo", "cm", "inch", "large", "big", "small", "heavy",
        "light", "package", "parcel", "box", "oversize", "freight", "pallet",
        # Chinese
        "尺寸", "大小", "重量", "多重", "多大", "包裹", "盒子", "大件", "重",
        "斤", "公斤", "厘米",
    ],
    "schedule": [
        # English
        "when", "what time", "pickup", "pick up", "cutoff", "cut off",
        "deadline", "same day", "next day", "tomorrow", "today",
        "evening", "afternoon", "morning", "schedule", "available day",
        "what day",
        # Chinese
        "几点", "什么时候", "时间", "取件", "截止", "当天", "次日", "明天",
        "今天", "上午", "下午", "晚上", "早上", "周几", "星期",
    ],
}


def select_relevant_sections(message: str) -> list[str]:
    """Return the section names whose keywords match *message*.

    A postal-code mention always pulls in pricing + coverage because the
    customer is almost certainly asking "can you ship there / how much".
    """
    if not message:
        return []
    text_lower = message.lower()

    sections: set[str] = set()

    if _POSTAL_RE.search(message):
        sections.update({"pricing", "coverage"})

    for section, keywords in _INTENTS.items():
        for kw in keywords:
            if kw.lower() in text_lower:
                sections.add(section)
                break

    return sorted(sections)


def load_sections(sections: list[str]) -> str:
    """Concatenate the markdown content of the requested sections.

    Returns "" if no sections were requested or none exist.
    """
    if not sections:
        return ""
    parts: list[str] = []
    for sec in sections:
        path = KNOWLEDGE_DIR / f"{sec}.md"
        if not path.exists():
            continue
        try:
            content = path.read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if content:
            parts.append(content)
    return "\n\n---\n\n".join(parts)
