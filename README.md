# Multimodal Large Language Models for Behavioral Analysis in Sports Videos

This repository is the monorepo foundation for **Rugby Intelligence**, an internship project exploring multimodal behavioral analysis of rugby video. The Next.js workspace and FastAPI video/event foundation are functional; model inference remains behind explicit service boundaries.

## Architecture

```text
Frontend (Next.js)
        |
        v
Backend API (FastAPI)
        |
        v
AI Service
  |-- V-JEPA2 event proposals
  |-- Gemma/Qwen multimodal analysis
  |-- Rugby RAG
  `-- Player and pitch tracking
```

### Frontend

The `frontend/` application owns:

- the video analysis workspace;
- event timeline and boundary editing;
- event selection and client-side workspace state;
- the event-scoped chat interface;
- mock and future HTTP service implementations.

Demo analysis remains available through frontend mock services. Questions about
real uploaded clips use the backend analysis gateway and independent AI service;
the active provider is selected by AI-service configuration (`mock` or `qwen`).

### Backend

The `backend/` directory contains the first functional FastAPI milestone:

- a health endpoint;
- multipart video upload validation;
- local video storage, browser playback, and basic metadata extraction;
- JSON event persistence, detection APIs, and boundary updates.
- validated persistent-clip analysis forwarding to the AI service.

Event proposals currently come from a deterministic mock detector. Database
persistence and real AI processing are not implemented yet.

### AI service

The `ai-service/` directory separates V-JEPA2, VLM, RAG, and tracking modules.
Its private `vjepa2/` package contains the detector contract and temporary mock,
exposed to the backend only through `POST /analysis/events/detect`. Its
FastAPI analysis endpoint assembles video/event/clip context and invokes the
configured mock or Qwen API provider. It does not load PyTorch or a model
checkpoint.

### Data

The `data/` directory provides filesystem locations for original uploads,
normalized playback videos, extracted clips, and generated event documents. The
AI service also stores clip-scoped conversations under `data/conversations/`.
Runtime contents are ignored by Git so generated data is not committed.

## Repository structure

```text
frontend/      Working Next.js/React/TypeScript application
backend/       FastAPI upload, preprocessing, and streaming service
ai-service/    Detector contract plus future inference and retrieval modules
data/          Local original, processed, clip, event, and metadata storage
```

## Run the frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Validation commands:

```bash
pnpm lint
pnpm test
pnpm build
```

See `frontend/README.md` for the current prototype workflow, mock mode, and prepared API contracts.

## Environment strategy

- Frontend: Node.js with pnpm.
- Backend: Conda environment `rugby-backend`, defined only by
  `backend/environment.yml`.
- AI service: independent Conda environment `rugby-ai`, defined only by
  `ai-service/environment.yml`.
- Python requirements files are not maintained; each `environment.yml` is the
  single source of truth for its service.

Create and activate the backend environment:

```bash
cd backend
conda env create -f environment.yml
conda activate rugby-backend
```

Create and activate the AI service environment:

```bash
cd ai-service
conda env create -f environment.yml
conda activate rugby-ai
```

The current AI environment is intentionally lightweight. A future model-enabled
environment can add PyTorch/VLM dependencies when real inference work begins.

## Current scope

- Frontend prototype: implemented and working.
- Backend: video upload pipeline implemented.
- Event Data Layer: real API and JSON contracts with mocked proposals.
- AI service: analysis API, context builder, multi-turn conversation storage,
  mock provider, and external Qwen API provider implemented.
- Database and production file storage: not implemented.
- Model inference: not implemented.
- Video preprocessing: implemented.
- Event proposals: deterministic mock only; real V-JEPA2 and local VLM processing remain future work.
- Event clip extraction: lazy, boundary-authoritative, cached H.264/AAC MP4 output with Range preview streaming.

## Uploaded-video event flow

```text
Upload and preprocess video
  -> POST /videos/{video_id}/events/detect
  -> mock EventDetector proposal generation
  -> data/events/{video_id}.json
  -> frontend timeline, boundary editing, and analysis context
```

The Event Data Layer and API contract are production-shaped, but proposal
semantics are not real inference. The future
`ai-service/vjepa2/real_detector.py` adapter will load
`rugby_linear_head_5_classes` and implement the existing `EventDetector`
contract without changing routes, persistence, or frontend components.

## On-demand selected-event clips

No clips are created during upload or event detection. Previewing an event uses
a process-temporary extraction endpoint: it validates and streams the selected
2–60 second interval without writing `clips.json` or adding media beneath
`data/clips/`. Preview close/context changes request cleanup, with backend TTL
cleanup for abandoned resources.

Question submission is the only frontend flow that prepares or reuses a
persistent cached clip. Cache identity includes normalized boundaries and the
extraction profile. The browser submits the question to the backend clip-analysis
gateway, which validates metadata and calls the AI service. The response comes
from the configured mock or Qwen provider. Multi-turn history is stored by clip,
and provider presentation metadata flows back to the UI dynamically. Full-match and
temporary-preview playback share one themed custom `VideoPlayer`, while each
HTML video element remains authoritative for its own playback clock.

## Run the integrated analysis flow

Terminal 1:

```bash
cd backend
conda activate rugby-backend
uvicorn app.main:app --reload --port 8000
```

Terminal 2:

```bash
cd ai-service
conda activate rugby-ai
python -m app.main
```

The backend reads `AI_SERVICE_URL`, defaulting to `http://localhost:9000`. The AI
service reads `AI_SERVICE_HOST` and `AI_SERVICE_PORT`, defaulting to
`127.0.0.1:9000`. Docker Compose uses the internal URL
`http://ai-service:9000` and binds the AI service to `0.0.0.0:9000`.

## Docker Compose

Build and start the complete local stack from the repository root:

```bash
docker compose build
docker compose up -d
```

The frontend is available at `http://localhost:3000`, the backend health check
at `http://localhost:8000/health`, and the AI-service API at
`http://localhost:9000`. Its health check and OpenAPI documentation are exposed
at `http://localhost:9000/health` and `http://localhost:9000/docs`.

Compose mounts the shared `data/` directory at `/app/data` in both Python
services. The backend reaches AI functionality exclusively over HTTP at
`http://ai-service:9000`; it does not import AI-service or V-JEPA2 modules.
