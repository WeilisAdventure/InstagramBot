import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.knowledge.loader import KNOWLEDGE_DIR
from app.security import verify_token

router = APIRouter(
    prefix="/api/knowledge",
    tags=["knowledge"],
    dependencies=[Depends(verify_token)],
)

# Built-in sections with hardcoded intent routing in sections.py.
# system_prompt is critical and may NOT be deleted.
PROTECTED_SECTIONS = {"system_prompt"}
BUILTIN_SECTIONS = {"system_prompt", "pricing", "coverage", "sizes", "schedule"}

# Only allow safe filenames: lowercase letters, digits, underscore.
_NAME_RE = re.compile(r"^[a-z0-9_]+$")


def _validate_name(section: str) -> None:
    if not _NAME_RE.match(section or ""):
        raise HTTPException(400, "Invalid section name (use lowercase letters, digits, underscore only)")


def _path(section: str):
    _validate_name(section)
    return KNOWLEDGE_DIR / f"{section}.md"


@router.get("")
async def list_sections():
    """List all .md files in the knowledge_base directory."""
    if not KNOWLEDGE_DIR.exists():
        return {"sections": []}
    sections = []
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        name = path.stem
        sections.append({
            "section": name,
            "builtin": name in BUILTIN_SECTIONS,
            "protected": name in PROTECTED_SECTIONS,
        })
    return {"sections": sections}


@router.get("/{section}")
async def get_section(section: str):
    path = _path(section)
    if not path.exists():
        return {"section": section, "content": ""}
    return {"section": section, "content": path.read_text(encoding="utf-8")}


class KnowledgeUpdate(BaseModel):
    content: str


@router.put("/{section}")
async def update_section(section: str, data: KnowledgeUpdate):
    path = _path(section)
    path.write_text(data.content, encoding="utf-8")
    return {"section": section, "ok": True}


class KnowledgeCreate(BaseModel):
    section: str
    content: str = ""


@router.post("")
async def create_section(data: KnowledgeCreate):
    """Create a new knowledge base file."""
    _validate_name(data.section)
    path = KNOWLEDGE_DIR / f"{data.section}.md"
    if path.exists():
        raise HTTPException(409, f"Section '{data.section}' already exists")
    KNOWLEDGE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(data.content, encoding="utf-8")
    return {"section": data.section, "ok": True}


@router.delete("/{section}")
async def delete_section(section: str):
    """Delete a knowledge base file. Protected sections cannot be deleted."""
    _validate_name(section)
    if section in PROTECTED_SECTIONS:
        raise HTTPException(403, f"'{section}' is protected and cannot be deleted")
    path = KNOWLEDGE_DIR / f"{section}.md"
    if not path.exists():
        raise HTTPException(404, f"Section '{section}' not found")
    path.unlink()
    return {"section": section, "ok": True}
