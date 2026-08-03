"""Synchronous, cross-platform FFmpeg and FFprobe process execution."""

import json
from functools import lru_cache
import re
import shutil
import subprocess
import sys
from pathlib import Path


class FFmpegExecutionError(RuntimeError):
    """Raised when an FFmpeg-family command cannot complete successfully."""


def find_media_executable(name: str) -> str | None:
    """Find an executable on PATH or inside the active Conda prefix."""
    executable = shutil.which(name)
    if executable is not None:
        return executable

    candidates = (
        Path(sys.prefix) / "Library" / "bin" / f"{name}.exe",
        Path(sys.prefix) / "bin" / name,
    )
    return next((str(candidate) for candidate in candidates if candidate.is_file()), None)


def run_ffprobe(video_path: str | Path) -> dict[str, object]:
    """Run FFprobe synchronously and return its JSON stream/format details."""
    ffprobe = find_media_executable("ffprobe")
    if ffprobe is None:
        raise FFmpegExecutionError("FFprobe is not installed or is not on PATH.")

    command = [
        ffprobe,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        str(video_path),
    ]
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or str(error)).strip()
        raise FFmpegExecutionError(f"FFprobe could not read the video: {message}") from error
    except OSError as error:
        raise FFmpegExecutionError(f"FFprobe could not start: {error}") from error

    try:
        details = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise FFmpegExecutionError("FFprobe returned invalid video metadata.") from error
    if not isinstance(details, dict):
        raise FFmpegExecutionError("FFprobe returned invalid video metadata.")
    return details


@lru_cache(maxsize=None)
def encoder_available(encoder: str) -> bool:
    """Return whether the installed FFmpeg build advertises an encoder."""
    ffmpeg = find_media_executable("ffmpeg")
    if ffmpeg is None:
        return False
    try:
        result = subprocess.run(
            [ffmpeg, "-hide_banner", "-encoders"],
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, OSError):
        return False
    pattern = rf"^\s*[VAS]\S*\s+{re.escape(encoder)}\s"
    return re.search(pattern, result.stdout, flags=re.MULTILINE) is not None


def run_ffmpeg(
    input_path: str | Path,
    output_path: str | Path,
    video_encoder: str = "libx264",
) -> None:
    """Run the synchronous H.264/AAC normalization command."""
    if video_encoder not in {"libx264", "h264_nvenc"}:
        raise ValueError(f"Unsupported H.264 encoder: {video_encoder}")
    ffmpeg = find_media_executable("ffmpeg")
    if ffmpeg is None:
        raise FFmpegExecutionError("FFmpeg is not installed or is not on PATH.")

    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(input_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a?",
        "-c:v",
        video_encoder,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    try:
        subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or str(error)).strip()
        if len(message) > 2000:
            message = message[-2000:]
        raise FFmpegExecutionError(f"FFmpeg normalization failed: {message}") from error
    except OSError as error:
        raise FFmpegExecutionError(f"FFmpeg could not start: {error}") from error


def run_clip_ffmpeg(
    input_path: str | Path,
    output_path: str | Path,
    start: float,
    duration: float,
    video_encoder: str = "libx264",
) -> None:
    """Accurately re-encode a bounded H.264/AAC event clip."""
    if video_encoder not in {"libx264", "h264_nvenc"}:
        raise ValueError(f"Unsupported H.264 encoder: {video_encoder}")
    ffmpeg = find_media_executable("ffmpeg")
    if ffmpeg is None:
        raise FFmpegExecutionError("FFmpeg is not installed or is not on PATH.")
    preset = "p4" if video_encoder == "h264_nvenc" else "medium"
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(input_path),
        "-t",
        f"{duration:.3f}",
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c:v",
        video_encoder,
        "-preset",
        preset,
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    try:
        subprocess.run(command, capture_output=True, text=True, check=True)
    except subprocess.CalledProcessError as error:
        message = (error.stderr or error.stdout or str(error)).strip()
        if len(message) > 2000:
            message = message[-2000:]
        raise FFmpegExecutionError(f"FFmpeg clip extraction failed: {message}") from error
    except OSError as error:
        raise FFmpegExecutionError(f"FFmpeg could not start: {error}") from error
