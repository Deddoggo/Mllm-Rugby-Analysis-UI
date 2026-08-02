"""FastAPI entry point for the future Rugby Intelligence backend."""

from fastapi import FastAPI


app = FastAPI(
    title="Rugby Intelligence API",
    description=(
        "Future orchestration service for video upload, event management, "
        "and multimodal analysis requests."
    ),
    version="0.1.0",
)
