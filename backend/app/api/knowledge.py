from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.knowledge import KnowledgeEntry
from app.schemas.knowledge import KnowledgeCreate, KnowledgeUpdate, KnowledgeResponse

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
