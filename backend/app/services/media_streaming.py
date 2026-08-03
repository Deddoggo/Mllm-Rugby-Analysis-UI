"""Reusable browser media responses with HTTP Range support."""

from pathlib import Path

from fastapi.responses import FileResponse


def media_file_response(path: Path, media_type: str) -> FileResponse:
    """Return a Starlette FileResponse, which handles valid and invalid ranges."""
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Accept-Ranges": "bytes"},
    )
