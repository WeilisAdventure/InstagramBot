import json
import logging
import anthropic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.knowledge import KnowledgeEntry
from app.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate, KnowledgeResponse
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])


@router.get("", response_model=list[KnowledgeResponse])
async def list_entries(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(KnowledgeEntry).order_by(KnowledgeEntry.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=KnowledgeResponse, status_code=201)
async def create_entry(data: KnowledgeCreate, db: AsyncSession = Depends(get_db)):
    entry = KnowledgeEntry(**data.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.get("/{entry_id}", response_model=KnowledgeResponse)
async def get_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    return entry


@router.patch("/{entry_id}", response_model=KnowledgeResponse)
async def update_entry(entry_id: int, data: KnowledgeUpdate, db: AsyncSession = Depends(get_db)):
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(entry, key, val)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
async def delete_entry(entry_id: int, db: AsyncSession = Depends(get_db)):
    entry = await db.get(KnowledgeEntry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    await db.delete(entry)
    await db.commit()


@router.delete("", status_code=204)
async def delete_all_entries(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(KnowledgeEntry))
    for entry in result.scalars().all():
        await db.delete(entry)
    await db.commit()


@router.post("/upload", response_model=list[KnowledgeResponse], status_code=201)
async def upload_knowledge_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload any text file — AI extracts Q&A pairs automatically."""
    content = (await file.read()).decode("utf-8")
    filename = file.filename or "unknown"

    # Truncate very large files to avoid token limits
    if len(content) > 30000:
        content = content[:30000]

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    prompt = (
        f"从以下文件内容中提取所有可以作为客服知识库的问答对。\n"
        f"文件名: {filename}\n\n"
        f"要求:\n"
        f"1. 每条包含 question（用户可能会问的问题）和 answer（标准回答，保持简洁，不超过200字）\n"
        f"2. 如果内容是产品信息、政策说明等，自行拆分成多个合理的问答对\n"
        f"3. 可选添加 category 分类\n"
        f"4. 返回纯 JSON 数组，不要 markdown 代码块\n"
        f"5. 格式: [{{\"question\": \"...\", \"answer\": \"...\", \"category\": \"...\"}}]\n\n"
        f"文件内容:\n{content}"
    )

    try:
        response = await client.messages.create(
            model=settings.ai_model,
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3]
            raw = raw.strip()
        # If JSON was truncated (output hit token limit), salvage complete entries
        try:
            entries = json.loads(raw)
        except json.JSONDecodeError:
            last_brace = raw.rfind("}")
            if last_brace > 0:
                raw_fixed = raw[:last_brace + 1] + "]"
                entries = json.loads(raw_fixed)
                logger.info(f"Salvaged truncated JSON for {filename}: parsed partial array")
            else:
                raise
    except json.JSONDecodeError:
        logger.error(f"AI returned invalid JSON for file {filename}: {raw[:200]}")
        raise HTTPException(400, "AI 无法从文件中提取有效的问答对")
    except Exception as e:
        logger.error(f"AI extraction failed for file {filename}: {e}")
        raise HTTPException(500, f"AI 提取失败: {e}")

    if not isinstance(entries, list) or not entries:
        raise HTTPException(400, "未能从文件中提取到任何问答对")

    created = []
    for e in entries:
        q = str(e.get("question", "")).strip()
        a = str(e.get("answer", "")).strip()
        if not q or not a:
            continue
        obj = KnowledgeEntry(
            question=q,
            answer=a,
            category=str(e.get("category", "")).strip(),
        )
        db.add(obj)
        await db.flush()
        await db.refresh(obj)
        created.append(obj)
    await db.commit()

    if not created:
        raise HTTPException(400, "未能从文件中提取到有效的问答对")

    return created
