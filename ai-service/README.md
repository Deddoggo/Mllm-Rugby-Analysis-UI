# AI Service

This directory reserves isolated modules for the future Rugby Intelligence inference pipeline. It contains no model implementation or runtime integration yet.

## `vjepa2/`

Future responsibilities:

- video event detection;
- sliding-window inference;
- event proposal generation.

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
