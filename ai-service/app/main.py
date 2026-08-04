"""FastAPI entry point for the independent Rugby Intelligence AI service."""

from fastapi import FastAPI

from app.api.analysis import router as analysis_router
from app.core.config import settings


app = FastAPI(title="Rugby Intelligence AI Service", version="0.1.0")
app.include_router(analysis_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-service"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
