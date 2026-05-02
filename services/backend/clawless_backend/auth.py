from fastapi import Header, HTTPException, status

from .config import settings


async def require_api_key(x_clawless_key: str = Header(default="")) -> None:
    if not settings.api_key:
        return
    if x_clawless_key != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid api key",
        )
