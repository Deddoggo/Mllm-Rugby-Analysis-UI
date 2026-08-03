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

Demo analysis remains available through frontend mock services. Real uploads use
the backend upload, streaming, and event APIs while retaining the current mock
chat implementation.

### Backend

The `backend/` directory contains the first functional FastAPI milestone:

- a health endpoint;
- multipart video upload validation;
- local video storage, browser playback, and basic metadata extraction;
- JSON event persistence, detection APIs, and boundary updates.

Event proposals currently come from a deterministic mock detector. Database
persistence and real AI processing are not implemented yet.

### AI service

The `ai-service/` directory separates V-JEPA2, VLM, RAG, and tracking modules.
Its `vjepa2/` package now contains the detector contract and temporary mock; it
does not load PyTorch or a model checkpoint.

### Data

The `data/` directory provides filesystem locations for original uploads,
normalized playback videos, extracted clips, and generated event documents. The
contents are ignored by Git so large or generated runtime data is not committed.

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
- Backend: Conda environment named `rugby-backend`, defined in `backend/environment.yml`.
- AI service: a future, separate Conda environment for PyTorch and VLM dependencies; it is not created yet.

## Current scope

- Frontend prototype: implemented and working.
- Backend: video upload pipeline implemented.
- Event Data Layer: real API and JSON contracts with mocked proposals.
- AI service: detector abstraction implemented; real inference unavailable.
- Database and production file storage: not implemented.
- Model inference: not implemented.
- Video preprocessing: implemented.
- Event proposals: deterministic mock only; real V-JEPA2 and VLM processing remain future work.
- Event clip extraction: lazy, boundary-authoritative, cached H.264/AAC MP4 output with Range preview streaming.

## Uploaded-video event flow

```text
Upload and preprocess video
  -> POST /videos/{video_id}/events/detect
  -> mock EventDetector proposal generation
  -> data/events/{video_id}.json
  -> frontend timeline, boundary editing, and mock chat context
```

The Event Data Layer and API contract are production-shaped, but proposal
semantics are not real inference. The future
`ai-service/vjepa2/real_detector.py` adapter will load
`rugby_linear_head_5_classes` and implement the existing `EventDetector`
contract without changing routes, persistence, or frontend components.

## On-demand selected-event clips

No clips are created during upload or event detection. Previewing an event or
submitting a question asks the backend to read the latest persisted event,
extract only that 2–60 second interval, validate it, and cache it under
`data/clips/{video_id}/`. Cache identity includes the normalized boundaries and
the extraction profile, so edits make prior clips stale without deleting them.

The frontend previews the resulting Range stream in a player separate from the
full-match clock. Question submission prepares/reuses the clip first and passes
its ID into the existing mock analysis context; no VLM inference is claimed.
