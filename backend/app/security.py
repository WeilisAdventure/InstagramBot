from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from app.config import settings

security = HTTPBearer()

SECRET_KEY = settings.auth_secret_key
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24


def create_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    return jwt.encode({"sub": "admin", "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub", "")
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
