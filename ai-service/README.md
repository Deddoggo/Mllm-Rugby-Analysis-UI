# Rugby Intelligence AI Service

This directory is the independent FastAPI boundary for future rugby inference.
It currently provides a real HTTP contract, context assembly, and a deterministic
mock VLM. It does not load or run any machine-learning model.

## Current request flow

```text
Frontend
  -> Backend
      -> AI Service
          -> ContextBuilder
          -> MockVLM
```

The backend is not connected to this service yet. Existing upload, event
detection, clip extraction, timeline, and mock chat behavior therefore remain
unchanged.

## API

```http
GET  /health
POST /analysis/query
```

Example analysis request:

```json
{
  "video_id": "match_20260803_abcd1234",
  "event_id": "event_001",
  "clip_id": "clip_event_001_abcd1234",
  "question": "Explain this scrum phase"
}
```

Example response:

```json
{
  "answer": "This is a scrum phase. A future model would analyze player formation, engagement, stability, and the possession outcome.",
  "model": "mock-vlm",
  "context_used": {
    "event": {
      "label": "Scrum",
      "start": 42.0,
      "end": 55.0,
      "confidence": 0.92
    },
    "clip": {
      "duration": 13.0
    }
  }
}
```

`ContextBuilder` is a read-only consumer of the existing backend JSON contracts
at `data/events/{video_id}.json` and
`data/clips/{video_id}/clips.json`. Missing, empty, or malformed metadata yields
empty event/clip context instead of failing analysis. It contains no persistence,
cache, extraction, or metadata-writing logic.

## Run locally

From `ai-service/`:

```bash
conda env create -f environment.yml
conda activate rugby-ai
python -m app.main
```

Configuration:

- `AI_SERVICE_HOST` defaults to `127.0.0.1`.
- `AI_SERVICE_PORT` defaults to `8100`.
- `RUGBY_DATA_DIR` optionally overrides the repository `data/` directory used
  for read-only context lookup.

The module launcher starts Uvicorn with reload enabled and reads host/port from
those settings. Uvicorn can still be invoked directly when deployment tooling
supplies its own process configuration.

`environment.yml` is the AI service's single dependency source. It contains the
minimal runtime packages (FastAPI, Uvicorn, and Pydantic) plus pytest and HTTPX
for endpoint tests. It intentionally contains no model-inference dependencies.

## Tests

```bash
conda activate rugby-ai
python -m compileall app tests
pytest
```

Tests cover health, the analysis query contract, deterministic event-aware mock
answers, context mapping, and missing/malformed metadata recovery.

## Existing V-JEPA2 boundary

The top-level `vjepa2/` package remains the stable detector contract currently
used in process by the backend. `vjepa2/mock_detector.py` continues to provide
deterministic proposals. This milestone does not move event detection behind the
AI-service HTTP API and does not add model dependencies.

The future `rugby_linear_head_5_classes` adapter belongs at
`vjepa2/real_detector.py` behind the existing `EventDetector` contract.

## Future architecture

```text
Backend
  -> AI Service
      +------------------------+
      | V-JEPA2 detection      |
      | VLM video analysis     |
      | Rugby knowledge RAG    |
      | Player/ball tracking   |
      | OCR/context extraction |
      +------------------------+
```

The first real VLM adapter will implement `app/vlm/interface.py` and be injected
into `AnalysisService`. Replacing `MockVLM` must not require changes to the
`POST /analysis/query` contract, context builder, or API route.

No PyTorch, Transformers, TorchCodec, OpenCV, vLLM, Qwen, or Gemma dependency is
included in this milestone.
