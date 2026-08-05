# V-JEPA2 event detector boundary

`contracts.py` defines the AI-service-internal event proposal interface.
`MockVJEPA2Detector` is a deterministic temporary implementation; it does not
load a model or inspect frames. Backend consumers access it only through
`POST /analysis/events/detect`.

The future adapter for `rugby_linear_head_5_classes` belongs in this directory
and must implement `EventDetector`. It will modularize model loading, a four-second
sliding-window scan with one-second stride and 16 sampled frames, confidence
thresholding near 0.80, Background suppression, temporal smoothing/merging with
roughly two-second tolerance, filtering, and final proposal generation.

Replacing the mock must not change backend routes, JSON persistence, frontend
contracts, timeline components, or the upload flow. Detector implementations are
never imported by the backend.
