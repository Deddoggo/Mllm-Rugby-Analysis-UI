"""FFmpeg-based video normalization for playback and future model input."""

import asyncio
from dataclasses import dataclass
import logging
from pathlib import Path
from uuid import uuid4

from app.core.config import PROCESSED_VIDEO_DIR
from app.services.ffmpeg import (
    FFmpegExecutionError,
    encoder_available,
    run_ffmpeg,
    run_ffprobe,
)


logger = logging.getLogger("uvicorn.error")


class VideoProcessingError(RuntimeError):
    """Raised when video inspection or normalization cannot complete."""


@dataclass(frozen=True)
class VideoFormat:
    """Playback-relevant properties reported by FFprobe."""

    container: str
    video_codec: str
    audio_codec: str | None
    pixel_format: str
    duration: float | None

    @property
    def is_normalized(self) -> bool:
        """Return whether the original already meets the normalized contract."""
        return (
            self.container == "mp4"
            and self.video_codec == "h264"
            and self.audio_codec in {None, "aac"}
            and self.pixel_format == "yuv420p"
        )


def generate_processed_path(video_id: str) -> Path:
    """Generate the canonical processed MP4 path for a video ID."""
    if not video_id.startswith("match_") or not video_id.replace("_", "").isalnum():
        raise ValueError("Invalid video ID.")
    return PROCESSED_VIDEO_DIR / f"{video_id}_processed.mp4"


async def check_video_format(input_path: Path) -> VideoFormat:
    """Detect container, codecs, pixel format, and duration with FFprobe."""
    if not input_path.is_file():
        raise VideoProcessingError("The original video file does not exist.")

    try:
        details = await asyncio.to_thread(run_ffprobe, input_path)
    except FFmpegExecutionError as error:
        raise VideoProcessingError(str(error)) from error
    streams = details.get("streams", [])
    if not isinstance(streams, list):
        raise VideoProcessingError("FFprobe returned invalid stream metadata.")
    video_stream = next(
        (stream for stream in streams if stream.get("codec_type") == "video"),
        None,
    )
    if video_stream is None:
        raise VideoProcessingError("The uploaded file does not contain a video stream.")
    audio_stream = next(
        (stream for stream in streams if stream.get("codec_type") == "audio"),
        None,
    )
    format_details = details.get("format", {})
    if not isinstance(format_details, dict):
        format_details = {}
    format_names = str(format_details.get("format_name", "")).split(",")
    container = (
        "mp4"
        if input_path.suffix.lower() == ".mp4" and "mp4" in format_names
        else (format_names[0] or "unknown")
    )
    try:
        duration = float(format_details["duration"])
    except (KeyError, TypeError, ValueError):
        duration = None
    return VideoFormat(
        container=container,
        video_codec=str(video_stream.get("codec_name", "unknown")),
        audio_codec=(
            str(audio_stream.get("codec_name", "unknown"))
            if audio_stream is not None
            else None
        ),
        pixel_format=str(video_stream.get("pix_fmt", "unknown")),
        duration=duration,
    )


async def normalize_video(
    input_path: Path,
    output_path: Path,
    video_format: VideoFormat | None = None,
) -> Path:
    """Normalize a video to MP4/H.264/yuv420p with AAC and fast-start metadata."""
    if video_format is None:
        await check_video_format(input_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = output_path.with_name(
        f".{output_path.stem}.{uuid4().hex}.tmp.mp4"
    )
    use_nvenc = await asyncio.to_thread(encoder_available, "h264_nvenc")
    encoders = ("h264_nvenc", "libx264") if use_nvenc else ("libx264",)
    last_error: FFmpegExecutionError | None = None
    for encoder in encoders:
        try:
            logger.info("Video encoder selected encoder=%s", encoder)
            await asyncio.to_thread(
                run_ffmpeg,
                input_path,
                temporary_path,
                encoder,
            )
            last_error = None
            break
        except FFmpegExecutionError as error:
            temporary_path.unlink(missing_ok=True)
            last_error = error
            if encoder == "h264_nvenc":
                logger.warning(
                    "NVENC normalization failed; falling back to libx264 error=%s",
                    error,
                )
    if last_error is not None:
        raise VideoProcessingError(str(last_error)) from last_error

    try:
        temporary_path.replace(output_path)
    except OSError as error:
        temporary_path.unlink(missing_ok=True)
        raise VideoProcessingError(
            f"The processed video could not be finalized: {error}"
        ) from error
    return output_path
