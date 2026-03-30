from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.settings import SystemSettings
from app.schemas.settings import SettingsResponse, SettingsUpdate
from app.security import verify_token

router = APIRouter(prefix="/api/settings", tags=["settings"], dependencies=[Depends(verify_token)])

DEFAULTS = {
    "ig_connection_status": "disconnected",
    "ai_model": "claude-sonnet-4-20250514",
    "ai_model_provider": "anthropic",
    "custom_api_key": "",
    "custom_base_url": "",
    "reply_delay_seconds": "3",
    "translation_strategy": "auto",
    "notification_enabled": "true",
    "notification_sound": "true",
    "notification_desktop": "true",
    "notification_title_flash": "true",
    "auto_reply_enabled": "true",
    "comment_trigger_enabled": "true",
}


async def _get_setting(db: AsyncSession, key: str) -> str:
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    return setting.value if setting else DEFAULTS.get(key, "")


async def _set_setting(db: AsyncSession, key: str, value: str):
    result = await db.execute(
        select(SystemSettings).where(SystemSettings.key == key)
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        db.add(SystemSettings(key=key, value=value))


@router.get("", response_model=SettingsResponse)
async def get_settings(request: Request = None, db: AsyncSession = Depends(get_db)):
    # Dynamically check real IG connection status and account info
    ig_status = "disconnected"
    ig_username = ""
    ig_api_version = ""
    ig_client = getattr(request.app.state, "ig_client", None) if request else None
    if ig_client:
        if getattr(ig_client, "connected", False):
            ig_status = "connected"
        ig_username = getattr(ig_client, "username", "") or ""
        from app.instagram.graph_api_client import GRAPH_API_BASE
        ig_api_version = GRAPH_API_BASE.split("/")[-1] if "graph.instagram.com" in GRAPH_API_BASE else ""
    return SettingsResponse(
        ig_connection_status=ig_status,
        ig_username=ig_username,
        ig_api_version=ig_api_version,
        ai_model=await _get_setting(db, "ai_model"),
        ai_model_provider=await _get_setting(db, "ai_model_provider"),
        custom_api_key=await _get_setting(db, "custom_api_key"),
        custom_base_url=await _get_setting(db, "custom_base_url"),
        reply_delay_seconds=int(await _get_setting(db, "reply_delay_seconds")),
        translation_strategy=await _get_setting(db, "translation_strategy"),
        notification_enabled=(await _get_setting(db, "notification_enabled")).lower() in ("true", "1"),
        notification_sound=(await _get_setting(db, "notification_sound")).lower() in ("true", "1"),
        notification_desktop=(await _get_setting(db, "notification_desktop")).lower() in ("true", "1"),
        notification_title_flash=(await _get_setting(db, "notification_title_flash")).lower() in ("true", "1"),
        auto_reply_enabled=(await _get_setting(db, "auto_reply_enabled")).lower() in ("true", "1"),
        comment_trigger_enabled=(await _get_setting(db, "comment_trigger_enabled")).lower() in ("true", "1"),
    )


@router.patch("", response_model=SettingsResponse)
async def update_settings(data: SettingsUpdate, request: Request, db: AsyncSession = Depends(get_db)):
    updates = data.model_dump(exclude_unset=True)
    for key, val in updates.items():
        await _set_setting(db, key, str(val).lower() if isinstance(val, bool) else str(val))
    await db.commit()
    return await get_settings(request=request, db=db)
