import asyncio
import csv
import io
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


# --- File upload helpers ---

def _parse_csv_entries(content: str) -> list[dict]:
    """Parse CSV with question,answer[,category] columns."""
    reader = csv.DictReader(io.StringIO(content))
    entries = []
    for row in reader:
        q = row.get("question") or row.get("Q") or row.get("问题") or ""
        a = row.get("answer") or row.get("A") or row.get("回答") or row.get("答案") or ""
        cat = row.get("category") or row.get("分类") or ""
        if q.strip() and a.strip():
            entries.append({"question": q.strip(), "answer": a.strip(), "category": cat.strip()})
    return entries


def _parse_markdown_entries(content: str) -> list[dict]:
    """Parse Markdown Q&A format: #### Q: question / **A:** answer, separated by ---."""
    import re
    entries = []
    # Split by --- separator
    blocks = re.split(r'\n-{3,}\n', content)
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        # Find question: #### Q: or ## Q: or # Q:
        q_match = re.search(r'^#{1,6}\s*Q[:：]\s*(.+)', block, re.MULTILINE)
        if not q_match:
            continue
        question = q_match.group(1).strip()
        # Find answer: everything after **A:** line
        a_match = re.search(r'\*{0,2}A[:：]\*{0,2}\s*(.*)', block[q_match.end():], re.DOTALL)
        if not a_match:
            continue
        answer = a_match.group(1).strip()
        if not answer:
            continue
        # Clean up markdown formatting for storage
        answer = re.sub(r'\*\*(.+?)\*\*', r'\1', answer)  # Remove bold
        answer = re.sub(r'\n\s*\n', '\n', answer)  # Collapse blank lines
        answer = answer.strip()
        if question and answer:
            entries.append({"question": question, "answer": answer, "category": ""})
    return entries


def _parse_json_entries(content: str) -> list[dict]:
    """Parse JSON array of {question, answer} objects."""
    data = json.loads(content)
    if isinstance(data, dict):
        for key in ("entries", "data", "items", "knowledge"):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
    if not isinstance(data, list):
        return []
    entries = []
    for item in data:
        if not isinstance(item, dict):
            continue
        q = str(item.get("question", "") or item.get("Q", "") or item.get("问题", "")).strip()
        a = str(item.get("answer", "") or item.get("A", "") or item.get("回答", "") or item.get("答案", "")).strip()
        cat = str(item.get("category", "") or item.get("分类", "")).strip()
        if q and a:
            entries.append({"question": q, "answer": a, "category": cat})
    return entries


def _split_text(content: str, max_chars: int = 8000) -> list[str]:
    """Split text into chunks at paragraph boundaries."""
    if len(content) <= max_chars:
        return [content]
    chunks = []
    while content:
        if len(content) <= max_chars:
            chunks.append(content)
            break
        cut = content.rfind("\n\n", 0, max_chars)
        if cut < max_chars // 2:
            cut = content.rfind("\n", 0, max_chars)
        if cut < max_chars // 2:
            cut = max_chars
        chunks.append(content[:cut])
        content = content[cut:].lstrip()
    return chunks


async def _ai_extract_chunk(client, model: str, chunk: str, filename: str, chunk_idx: int = 0, total: int = 1) -> list[dict]:
    """Use AI to extract Q&A pairs from one text chunk, with 1 retry on JSON failure."""
    import re
    prompt = (
        "从以下文件内容中提取所有可以作为客服知识库的问答对。\n"
        f"文件名: {filename}\n\n"
        "要求:\n"
        "1. 每条包含 question（用户可能会问的问题）和 answer（标准回答，保持简洁，不超过200字）\n"
        "2. 如果内容是产品信息、政策说明等，自行拆分成多个合理的问答对\n"
        "3. 可选添加 category 分类\n"
        "4. 返回纯 JSON 数组，不要 markdown 代码块，不要任何解释文字\n"
        '5. 格式: [{"question": "...", "answer": "...", "category": "..."}]\n'
        "6. 确保 JSON 完整有效，所有括号闭合\n\n"
        f"文件内容:\n{chunk}"
    )

    for attempt in range(2):  # Try up to 2 times
        response = await client.messages.create(
            model=model,
            max_tokens=16000,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text.strip()

        # Strip markdown code fences
        fence_match = re.search(r'```(?:json)?\s*\n?(.*?)```', raw, re.DOTALL)
        if fence_match:
            raw = fence_match.group(1).strip()

        # Find the JSON array boundaries
        start = raw.find("[")
        end = raw.rfind("]")
        if start >= 0 and end > start:
            raw = raw[start:end + 1]

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            # Try to fix truncated JSON
            last_brace = raw.rfind("}")
            if last_brace > 0:
                try:
                    return json.loads(raw[:last_brace + 1] + "]")
                except json.JSONDecodeError:
                    pass
            if attempt == 0:
                logger.warning(f"Chunk {chunk_idx+1}/{total}: JSON parse failed, retrying... (first 200 chars: {raw[:200]})")
            else:
                logger.warning(f"Chunk {chunk_idx+1}/{total}: JSON parse failed after retry (first 200 chars: {raw[:200]})")
                raise


@router.post("/upload", response_model=list[KnowledgeResponse], status_code=201)
async def upload_knowledge_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Upload a file — structured files parsed directly, others use AI with auto-chunking."""
    content = (await file.read()).decode("utf-8")
    filename = (file.filename or "unknown").lower()
    original_name = file.filename or "unknown"

    entries: list[dict] = []

    # Strategy 1: Direct parsing for structured files (no AI needed)
    if filename.endswith(".csv"):
        entries = _parse_csv_entries(content)
        if entries:
            logger.info(f"Parsed {len(entries)} Q&A pairs from CSV: {original_name}")

    elif filename.endswith(".json"):
        try:
            entries = _parse_json_entries(content)
            if entries:
                logger.info(f"Parsed {len(entries)} Q&A pairs from JSON: {original_name}")
        except json.JSONDecodeError:
            pass  # Fall through to AI extraction

    elif filename.endswith(".md"):
        entries = _parse_markdown_entries(content)
        if entries:
            logger.info(f"Parsed {len(entries)} Q&A pairs from Markdown: {original_name}")

    # Strategy 2: AI extraction with Haiku (cheap) as fallback
    if not entries:
        HAIKU_MODEL = "claude-haiku-4-5-20251001"
        client = anthropic.AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=300.0,
        )
        chunks = _split_text(content)
        logger.info(f"AI extracting (Haiku) from {original_name}: {len(content)} chars, {len(chunks)} chunk(s)")

        semaphore = asyncio.Semaphore(2)

        async def extract_one(i: int, chunk: str) -> list[dict]:
            async with semaphore:
                try:
                    result = await _ai_extract_chunk(client, HAIKU_MODEL, chunk, original_name, i, len(chunks))
                    if isinstance(result, list):
                        logger.info(f"Chunk {i+1}/{len(chunks)}: extracted {len(result)} entries")
                        return result
                except json.JSONDecodeError:
                    logger.warning(f"Chunk {i+1}/{len(chunks)}: AI returned invalid JSON, skipping")
                except Exception as e:
                    logger.error(f"Chunk {i+1}/{len(chunks)} extraction failed: {e}")
                return []

        results = await asyncio.gather(*[extract_one(i, c) for i, c in enumerate(chunks)])
        for chunk_entries in results:
            entries.extend(chunk_entries)

    if not entries:
        raise HTTPException(400, "未能从文件中提取到任何问答对")

    # Save to DB
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

    logger.info(f"Knowledge upload complete: {len(created)} entries from {original_name}")
    return created
