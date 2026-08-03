# AI Service

This directory owns isolated contracts and future implementations for the Rugby
Intelligence inference pipeline. It contains no real model runtime yet.

## `vjepa2/`

Current contents:

- `contracts.py`: stable `EventDetector` protocol and proposal shape;
- `mock_detector.py`: deterministic temporary proposals used in process by the backend.

Future responsibilities:

- video event detection;
- sliding-window inference;
- event proposal generation.

The real `rugby_linear_head_5_classes` adapter will be implemented at
`vjepa2/real_detector.py`. It will replace the mock behind the same contract and
modularize model loading, four-second windows, one-second stride, 16-frame
sampling, approximately 0.80 confidence thresholding, Background suppression,
temporal smoothing/merging, roughly two-second tolerance, filtering, and proposal
generation. No PyTorch, Transformers, TorchCodec, or checkpoint dependency is
included now.

The backend currently imports the mock adapter in process. A later deployment
will move this boundary behind an AI-service HTTP API without changing event
routes, JSON persistence, frontend contracts, timeline behavior, or upload flow.

## `vlm/`

Future responsibilities:

- Gemma/Qwen multimodal inference;
- event-clip video question answering;
- structured behavioral analysis responses.

## `rag/`

Future responsibilities:

- rugby rules retrieval;
- match and event metadata retrieval;
- contextual evidence assembly for VLM prompts.

## `tracking/`

Future responsibilities:

- player detection;
- player and ball tracking;
- pitch localization.

Dependencies will be added to `requirements.txt` only when the relevant implementation begins.
