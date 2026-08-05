# Rugby Intelligence AI Service

This directory is the independent FastAPI boundary for rugby inference. It
provides a stable HTTP contract, context assembly, a deterministic development
mock, and a configurable Qwen API adapter for external video understanding. It
does not load or run a local machine-learning model.

## Current request flow

```text
Frontend
  -> Backend
      -> AI Service
          -> ContextBuilder
          -> VLMInterface
              -> MockVLM | QwenVLM
```

The backend connects to this service only after it validates a persistent clip.
Upload, event detection, clip extraction, timeline, and player behavior remain
owned by their existing layers.

## API

```http
GET  /health
POST /analysis/query
GET  /analysis/conversations/{video_id}/{event_id}/{clip_id}
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
  "provider": "mock-rugby-vlm",
  "provider_metadata": {
    "id": "mock",
    "display_name": "Mock VLM",
    "model": null
  },
  "conversation_id": "conv_abcd1234",
  "turn_number": 1,
  "confidence": "limited",
  "metadata": {
    "context_used": {
      "video": {
        "filename": "match.mp4",
        "duration": 180.0
      },
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
}
```

`ContextBuilder` is a read-only consumer of the existing backend JSON contracts
at `data/metadata/videos.json`, `data/events/{video_id}.json`, and
`data/clips/{video_id}/clips.json`. Missing, empty, or malformed metadata yields
empty event/clip context instead of failing analysis. It contains no persistence,
cache, extraction, or metadata-writing logic.

## Multi-turn conversations

The AI service owns clip-scoped conversation persistence at:

```text
data/conversations/{video_id}/{clip_id}.json
```

Each document binds `video_id`, `event_id`, and `clip_id`, and stores ordered
user/assistant messages. Before each analysis request, prior messages are loaded
and supplied through the provider-neutral `VLMRequest.history`. A completed user
question and assistant answer are then written atomically. Different clips never
share history, and no database is required for the current milestone.

Analysis responses retain the existing answer/provider fields and additionally
return `provider_metadata`, `conversation_id`, and `turn_number`. Presentation
metadata such as `Qwen API · qwen3.7-flash` is created by the AI service so
clients do not infer provider names.

FastAPI returns HTTP 422 for invalid request payloads. Missing provider
credentials, external HTTP failures, malformed provider responses, and other
provider failures are wrapped by `AnalysisService` and returned as HTTP 500
without exposing keys or internal exceptions.

## Run locally

From `ai-service/`:

```bash
conda env create -f environment.yml
conda activate rugby-ai
python -m app.main
```

Copy the example file for local configuration:

```bash
copy .env.example .env
```

On PowerShell, `Copy-Item .env.example .env` is equivalent. The service loads
`ai-service/.env` automatically before constructing settings. Variables already
set in the process environment take precedence over values in `.env`, so
deployment and CI configuration continue to override local defaults. Restart
the service after changing `.env`.

Configuration:

- `AI_SERVICE_HOST` defaults to `127.0.0.1`.
- `AI_SERVICE_PORT` defaults to `8100`.
- `RUGBY_DATA_DIR` optionally overrides the repository `data/` directory used
  for read-only context lookup.
- `VLM_PROVIDER` selects `mock` or `qwen` and defaults to `mock`.
- `VLM_REQUEST_TIMEOUT` controls external API timeout seconds and defaults to
  `120`.

### Development mock

No API key is required for the default development provider:

```env
VLM_PROVIDER=mock
```

The deterministic `MockVLM` remains useful for local frontend/backend work and
tests. Selecting an external provider is explicit; a missing key or model is a
configuration error and does not silently send the request to another service.

### Qwen API

```env
VLM_PROVIDER=qwen
QWEN_API_KEY=replace-me
QWEN_MODEL=qwen3.7-plus
QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1
```

`QwenVLM` uses the same internal request contract but owns Qwen-specific content
ordering and endpoint configuration. Local clips up to 7 MB are sent as base64
`video_url` data URLs. Alibaba Cloud requires larger OpenAI-compatible video
inputs to use a public URL; this service currently rejects such clips because it
does not publish local media. Tests use HTTPX mock transports and never contact
the external API.

The module launcher starts Uvicorn with reload enabled and reads host/port from
those settings. Startup logs identify the selected VLM provider and model but
never print API keys. Uvicorn can still be invoked directly when deployment
tooling supplies its own process configuration.

`environment.yml` is the AI service's single dependency source. It contains the
minimal runtime packages (FastAPI, Uvicorn, Pydantic, and python-dotenv) plus
pytest and HTTPX for endpoint tests. It intentionally contains no
model-inference dependencies.

## Tests

```bash
conda activate rugby-ai
python -m compileall app tests
pytest
```

Tests cover health, the analysis query contract, deterministic event-aware mock
answers, context mapping, missing/malformed metadata recovery, provider
selection, missing credentials, Qwen request formatting, authentication,
response parsing, and provider failures.

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

`AnalysisService` depends only on `VLMInterface` and creates a provider-neutral
`VLMRequest(video_path, question, context)`. Each adapter converts that request
to its own wire format. A future local Gemma deployment should add, for example,
`app/vlm/gemma_vlm.py` and one factory branch:

```env
VLM_PROVIDER=gemma
```

It will not require changes to `POST /analysis/query`, `ContextBuilder`, the
backend gateway, or the frontend.

No PyTorch, Transformers, TorchCodec, OpenCV, CUDA, vLLM, model weights, Qwen
SDK, or Gemma runtime dependency is included in this milestone. External calls
reuse the existing HTTPX dependency.
