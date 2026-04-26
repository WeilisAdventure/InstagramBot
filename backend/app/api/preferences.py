from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.preference import ManagerPreference
from app.schemas.preference import PreferenceCreate, PreferenceResponse, PreferenceUpdate
from app.security import verify_token

router = APIRouter(
    prefix="/api/preferences",
    tags=["preferences"],
    dependencies=[Depends(verify_token)],
)


@router.get("", response_model=list[PreferenceResponse])
async def list_preferences(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ManagerPreference).order_by(ManagerPreference.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=PreferenceResponse, status_code=201)
async def create_preference(data: PreferenceCreate, db: AsyncSession = Depends(get_db)):
    pref = ManagerPreference(content=data.content.strip(), is_active=data.is_active)
    db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref


@router.patch("/{pref_id}", response_model=PreferenceResponse)
async def update_preference(pref_id: int, data: PreferenceUpdate, db: AsyncSession = Depends(get_db)):
    pref = await db.get(ManagerPreference, pref_id)
    if not pref:
        raise HTTPException(404, "Preference not found")
    if data.content is not None:
        pref.content = data.content.strip()
    if data.is_active is not None:
        pref.is_active = data.is_active
    await db.commit()
    await db.refresh(pref)
    return pref


@router.delete("/{pref_id}", status_code=204)
async def delete_preference(pref_id: int, db: AsyncSession = Depends(get_db)):
    pref = await db.get(ManagerPreference, pref_id)
    if not pref:
        raise HTTPException(404, "Preference not found")
    await db.delete(pref)
    await db.commit()
