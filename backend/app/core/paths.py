"""Portable resolution of media paths stored in JSON metadata."""

from pathlib import Path, PurePosixPath

from app.core.config import REPOSITORY_ROOT


DOCKER_APP_ROOT = PurePosixPath("/app")
DOCKER_DATA_DIR = Path("/app/data")


def _docker_data_mount_available() -> bool:
    """Return whether the conventional container data mount is present."""
    return DOCKER_DATA_DIR.is_dir()


def resolve_data_path(path: str, *, project_root: Path | None = None) -> str:
    """Resolve a stored media path against Docker or the local repository root.

    Absolute paths are preserved. Portable ``data/...`` paths prefer the
    conventional Docker mount at ``/app/data`` and fall back to the repository
    root when that mount is unavailable. ``project_root`` exists for isolated
    service tests and other explicitly rooted callers.
    """
    if not isinstance(path, str) or not path.strip():
        raise ValueError("A non-empty data path is required.")

    raw_path = Path(path)
    if raw_path.is_absolute():
        return str(raw_path.resolve()) if raw_path.exists() else str(raw_path)

    portable_path = PurePosixPath(path.replace("\\", "/"))
    if ".." in portable_path.parts:
        raise ValueError("Data path traversal is not allowed.")

    local_root = (project_root or REPOSITORY_ROOT).resolve()
    if portable_path.parts and portable_path.parts[0].lower() == "data":
        if project_root is None and _docker_data_mount_available():
            return str(DOCKER_APP_ROOT.joinpath(*portable_path.parts))
        candidate = local_root.joinpath(*portable_path.parts).resolve()
        data_root = (local_root / "data").resolve()
        if not candidate.is_relative_to(data_root):
            raise ValueError("Resolved path is outside the data directory.")
        return str(candidate)

    candidate = (local_root / raw_path).resolve()
    if not candidate.is_relative_to((local_root / "data").resolve()):
        raise ValueError("Resolved path is outside the data directory.")
    return str(candidate)
