"""FastAPI entry point for the independent Rugby Intelligence AI service."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.analysis import router as analysis_router
from app.core.config import settings


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    model = settings.qwen_model if settings.vlm_provider == "qwen" else "mock-rugby-vlm"
    logger.info(
        "AI service starting with VLM provider=%s model=%s",
        settings.vlm_provider,
        model,
    )
    yield


app = FastAPI(
    title="Rugby Intelligence AI Service",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(analysis_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
