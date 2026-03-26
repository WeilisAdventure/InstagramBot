import re
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.rule import CommentTriggerRule

logger = logging.getLogger(__name__)


def match_keywords(text: str, keywords: list[str], mode: str) -> bool:
    """Check if text matches keywords based on match mode."""
    text_lower = text.lower()
    for keyword in keywords:
        kw = keyword.lower()
        if mode == "exact" and text_lower == kw:
            return True
        elif mode == "contains" and kw in text_lower:
            return True
        elif mode == "regex":
            try:
                if re.search(kw, text, re.IGNORECASE):
                    return True
            except re.error:
                logger.warning(f"Invalid regex pattern: {kw}")
    return False


async def find_matching_rule(
    db: AsyncSession, comment_text: str
) -> CommentTriggerRule | None:
    """Find the first active rule that matches the comment text."""
    result = await db.execute(
        select(CommentTriggerRule).where(CommentTriggerRule.is_active == True)
    )
    rules = result.scalars().all()
    for rule in rules:
        if match_keywords(comment_text, rule.keywords, rule.match_mode):
            return rule
    return None


def render_template(template: str, **kwargs) -> str:
    """Render a template string with placeholders like {name}."""
    try:
        return template.format(**kwargs)
    except KeyError:
        return template
