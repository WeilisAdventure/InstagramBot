from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.rule import CommentTriggerRule
from app.schemas.rule import RuleCreate, RuleUpdate, RuleResponse

router = APIRouter(prefix="/api/rules", tags=["rules"])


@router.get("", response_model=list[RuleResponse])
async def list_rules(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CommentTriggerRule).order_by(CommentTriggerRule.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=RuleResponse, status_code=201)
async def create_rule(data: RuleCreate, db: AsyncSession = Depends(get_db)):
    rule = CommentTriggerRule(**data.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/{rule_id}", response_model=RuleResponse)
async def get_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    rule = await db.get(CommentTriggerRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    return rule


@router.patch("/{rule_id}", response_model=RuleResponse)
async def update_rule(rule_id: int, data: RuleUpdate, db: AsyncSession = Depends(get_db)):
    rule = await db.get(CommentTriggerRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    for key, val in data.model_dump(exclude_unset=True).items():
        setattr(rule, key, val)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db)):
    rule = await db.get(CommentTriggerRule, rule_id)
    if not rule:
        raise HTTPException(404, "Rule not found")
    await db.delete(rule)
    await db.commit()
