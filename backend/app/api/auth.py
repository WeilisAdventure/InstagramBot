from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.config import settings
from app.security import create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(data: LoginRequest):
    if data.password != settings.admin_password:
        raise HTTPException(401, "密码错误")
    return {"access_token": create_token(), "token_type": "bearer"}
