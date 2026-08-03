# V-JEPA2 event detector boundary

`contracts.py` defines the stable event proposal interface used by backend
orchestration. `MockVJEPA2Detector` is a deterministic temporary implementation;
it does not load a model or inspect frames.

The future adapter for `rugby_linear_head_5_classes` belongs in this directory
and must implement `EventDetector`. It will modularize model loading, a four-second
sliding-window scan with one-second stride and 16 sampled frames, confidence
thresholding near 0.80, Background suppression, temporal smoothing/merging with
roughly two-second tolerance, filtering, and final proposal generation.

Replacing the mock must not change backend routes, JSON persistence, frontend
contracts, timeline components, or the upload flow. The current in-process import
is temporary; a later deployment will expose the same contract through an AI
service HTTP API.
