"""FastAPI entry point for the independent Rugby Intelligence AI service."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.analysis import router as analysis_router
from app.api.events import router as events_router
from app.core.config import settings


logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    vlm_identity = (
        f"qwen:{settings.qwen_model}"
        if settings.vlm_provider == "qwen"
        else "mock-rugby-vlm"
    )
    detector_identity = (
        "mock-vjepa2" if settings.event_detector_provider == "mock"
        else settings.event_detector_provider
    )
    routes = sorted({
        *(route.path for route in analysis_router.routes),
        *(route.path for route in events_router.routes),
        "/health",
    })
    event_detection_available = any(
        route.path == "/analysis/events/detect"
        and "POST" in (route.methods or set())
        for route in events_router.routes
    )
    logger.info(
        "AI service starting host=%s port=%s event_detector=%s vlm_provider=%s "
        "event_detection_available=%s routes=%s",
        settings.host,
        settings.port,
        detector_identity,
        vlm_identity,
        event_detection_available,
        ",".join(routes),
    )
    yield


app = FastAPI(
    title="Rugby Intelligence AI Service",
    version="0.1.0",
    lifespan=lifespan,
)
app.include_router(analysis_router)
app.include_router(events_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
