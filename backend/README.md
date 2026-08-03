# Backend

This directory contains the FastAPI service for Rugby Intelligence.

## Current functionality

- `GET /health` service health check;
- `POST /videos/upload` multipart upload for MP4, MOV, and MKV videos;
- `GET /videos/{video_id}/stream` range-enabled video playback;
- `POST /videos/{video_id}/events/detect` cached or forced event detection;
- `GET /videos/{video_id}/events` predictable event retrieval;
- `PATCH /videos/{video_id}/events/{event_id}` persisted boundary adjustment;
- streamed local storage in the repository's `data/videos/` directory;
- SHA256 duplicate detection with stable video IDs;
- JSON video metadata in `data/metadata/videos.json`;
- FFmpeg normalization to MP4/H.264/yuv420p with AAC audio;
- file size metadata and duration metadata through `ffprobe`.
- atomic JSON event documents in `data/events/{video_id}.json`.

Database persistence and real AI processing are deliberately not implemented.
Event proposals are deterministic mock data; the repository, schemas, and API
contracts are real.

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
  events/     <video_id>.json
```

## Event Data Layer

`EventDetectionService` resolves processed video metadata and delegates proposal
generation through the `EventDetector` protocol. The current in-process adapter
is `ai-service/vjepa2/mock_detector.py`. It emits stable Scrum, Lineout, Maul,
and Goal Kick proposals within the real video duration and never returns
Background proposals to the timeline.

`EventRepository` owns JSON reads, recovery from absent/empty/malformed files,
atomic temporary-file replacement, and final boundary updates. Detected
boundaries remain immutable while adjusted `start` and `end` values are limited
to 60 seconds.

```json
{
  "video_id": "match_20260803_abcd1234",
  "status": "ready",
  "detector": "mock-vjepa2",
  "created_at": "2026-08-03T12:00:00Z",
  "events": [
    {
      "id": "event_001",
      "video_id": "match_20260803_abcd1234",
      "label": "Scrum",
      "start": 42.0,
      "end": 55.0,
      "confidence": 0.92,
      "detected_start": 42.0,
      "detected_end": 55.0,
      "adjusted": false
    }
  ]
}
```

Current orchestration is `Backend -> in-process mock detector`. The future
deployment boundary is `Backend -> AI service HTTP API -> real V-JEPA2 detector`.
The `rugby_linear_head_5_classes` integration belongs in
`ai-service/vjepa2/real_detector.py`, implementing the existing protocol.

## Run locally

```bash
conda env create -f environment.yml
conda activate rugby-backend
uvicorn app.main:app --reload --port 8000
```

Run backend tests with:

```bash
python -m unittest discover -s tests -v
```

## Intended structure

```text
app/
  main.py             FastAPI application entry point
  api/videos.py       Video HTTP endpoints
  api/events.py       Event detection, retrieval, and boundary endpoints
  schemas/event.py    Event persistence and API contracts
  schemas/video.py    Video metadata and response schemas
  core/config.py      Runtime data directory configuration
  services/storage.py Original storage, hashing, and ffprobe metadata
  services/ffmpeg.py Windows-compatible FFmpeg process execution
  services/video_metadata.py JSON metadata repository
  services/video_processing.py FFmpeg inspection and normalization
  services/event_repository.py Atomic event JSON repository
  services/event_detection.py Detector orchestration and adapter boundary
```
