# Multimodal Large Language Models for Behavioral Analysis in Sports Videos

This repository is the monorepo foundation for **Rugby Intelligence**, an internship project exploring multimodal behavioral analysis of rugby video. The existing Next.js frontend remains the working prototype. The backend and AI service directories define clean integration boundaries for future work and intentionally contain no business or inference logic yet.

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

The current prototype runs entirely through the frontend's mock data mode. Its service contracts are the future connection point to the backend.

### Backend

The `backend/` directory is a minimal FastAPI service skeleton reserved for:

- API orchestration;
- video upload and processing requests;
- event and clip request management;
- forwarding analysis work to AI services.

No API routes, persistence, or processing logic are implemented yet.

### AI service

The `ai-service/` directory separates future model responsibilities into V-JEPA2, VLM, RAG, and tracking modules. It contains documentation and placeholders only; it does not load or run models.

### Data

The `data/` directory provides filesystem locations for uploaded videos, extracted clips, and generated event documents. The contents are ignored by Git so large or generated runtime data is not committed.

## Repository structure

```text
frontend/      Working Next.js/React/TypeScript application
backend/       Future FastAPI orchestration service
ai-service/    Future inference and retrieval modules
data/          Local runtime video, clip, and event storage
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

## Current scope

- Frontend prototype: implemented and working.
- Backend: structure and entry point only.
- AI service: documented module boundaries only.
- Database and production file storage: not implemented.
- Model inference and video processing: not implemented.
