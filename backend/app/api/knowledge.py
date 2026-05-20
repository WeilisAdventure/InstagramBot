from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.knowledge.loader import KNOWLEDGE_DIR
from app.security import verify_token

router = APIRouter(
    prefix="/api/knowledge",
    tags=["knowledge"],
    dependencies=[Depends(verify_token)],
)

ALLOWED_SECTIONS = {"system_prompt", "pricing", "coverage", "sizes", "schedule"}


def _path(section: str):
    if section not in ALLOWED_SECTIONS:
        raise HTTPException(404, f"Unknown section: {section}")
    return KNOWLEDGE_DIR / f"{section}.md"


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
