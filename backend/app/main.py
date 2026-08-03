"""FastAPI entry point for the Rugby Intelligence backend."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.events import router as events_router
from app.api.videos import router as videos_router


app = FastAPI(
    title="Rugby Intelligence API",
    description="Backend API for Rugby Intelligence video workflows.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(videos_router)
app.include_router(events_router)


@app.get("/health")
async def health() -> dict[str, str]:
    """Return a lightweight service readiness response."""
    return {"status": "ok"}
