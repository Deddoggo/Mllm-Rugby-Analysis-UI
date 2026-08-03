# Backend

This directory contains the FastAPI service for Rugby Intelligence.

## Current functionality

- `GET /health` service health check;
- `POST /videos/upload` multipart upload for MP4, MOV, and MKV videos;
- `GET /videos/{video_id}/stream` range-enabled video playback;
- streamed local storage in the repository's `data/videos/` directory;
- SHA256 duplicate detection with stable video IDs;
- JSON video metadata in `data/metadata/videos.json`;
- FFmpeg normalization to MP4/H.264/yuv420p with AAC audio;
- file size metadata and duration metadata through `ffprobe`.

Database persistence, event detection, and AI processing are deliberately not implemented.

## Video metadata

Uploads are hashed incrementally with SHA256. When the same content is uploaded
again, the API returns `already_exists` with the original `video_id` instead of
storing another copy. Keeping that ID stable preserves the future relationships
to `events/{video_id}.json`, clips, and VLM analysis history.

Metadata access is isolated behind `VideoMetadataService`. Its current JSON
repository is intentionally small and replaceable; a future PostgreSQL adapter
can implement the same lookup and registration operations without changing the
upload or streaming contracts.

## Video preprocessing

FFmpeg and FFprobe are required and are installed by the Conda environment.
Each unique upload follows this synchronous pipeline:

```text
SHA256 validation
  -> save immutable original
  -> mark metadata as processing
  -> inspect with FFprobe
  -> reuse compatible originals or normalize with FFmpeg
  -> mark metadata as processed (or failed)
  -> serve the normalized MP4
```

FFprobe first detects the container, video codec, audio codec, and pixel format.
An MP4 that already uses H.264, `yuv420p`, and AAC (or has no audio stream) is
marked as processed without creating a second file; its `processed_path` points
to the immutable original. Other inputs are normalized with H.264, `yuv420p`,
AAC audio when present, and `+faststart` metadata placement for browser playback.

Normalization prefers NVIDIA `h264_nvenc` when the installed FFmpeg build and
runtime support it. If NVENC is unavailable or fails at runtime, processing
automatically falls back to `libx264`. If both paths fail, the original remains
in place and the failure is recorded in `data/metadata/videos.json`.

Runtime data is organized as:

```text
data/
  videos/     match_<id>_original.<ext>
  processed/  match_<id>_processed.mp4
  metadata/   videos.json
```

## Run locally

```bash
conda env create -f environment.yml
conda activate rugby-backend
uvicorn app.main:app --reload --port 8000
```

## Intended structure

```text
app/
  main.py             FastAPI application entry point
  api/videos.py       Video HTTP endpoints
  schemas/video.py    Video metadata and response schemas
  core/config.py      Runtime data directory configuration
  services/storage.py Original storage, hashing, and ffprobe metadata
  services/ffmpeg.py Windows-compatible FFmpeg process execution
  services/video_metadata.py JSON metadata repository
  services/video_processing.py FFmpeg inspection and normalization
```
