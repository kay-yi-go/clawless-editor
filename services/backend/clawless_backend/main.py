from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_api_key
from .config import settings
from .daily import router as daily_router
from .rename import router as rename_router
from .archive import router as archive_router

app = FastAPI(title="clawless-backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(daily_router, dependencies=[Depends(require_api_key)])
app.include_router(rename_router, dependencies=[Depends(require_api_key)])
app.include_router(archive_router, dependencies=[Depends(require_api_key)])


def run() -> None:
    import uvicorn

    uvicorn.run(
        "clawless_backend.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )
