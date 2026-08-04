# Rugby Intelligence

Rugby Intelligence is a production-oriented frontend foundation for multimodal behavioral analysis of rugby broadcasts. It presents precomputed V-JEPA2-style event proposals on an editable timeline, lets analysts refine clip boundaries, and provides an event-scoped conversation for future Gemma or Qwen-VL analysis.

This application is the `frontend/` package of the repository. Run all frontend package commands from this directory.

## Design

The interface reinterprets the supplied reference as professional research software: a light navigation shell, compact status bar, centered video focus, integrated timeline, large contextual AI composer, and quiet event cards. Rugby green anchors actions and selection; amber is reserved for temporal handles and uncertainty.

## Architecture

- Next.js App Router, React, TypeScript, Tailwind CSS
- TanStack Query for repository loading
- Zustand for workspace, adjusted events, selection, and per-event chat
- Zod for all external event and analysis payloads
- Interface-driven video, event, and analysis services
- Native HTML video and pointer-driven DOM timeline
- Vitest for domain, boundary, store, and factory tests

Visual components do not fetch or contain backend logic. `services/factory.ts` selects mock or API implementations through environment configuration.

## Setup

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build
```

Copy `.env.example` to `.env.local` if you want to change defaults.

## Demo mode

The precomputed proposals live at `public/demo/events.json`. Add your own local broadcast clip as:

```text
public/demo/match.mp4
```

The application deliberately does not include a large video. Without it, the polished placeholder, events, boundary editing, and mock analysis remain usable.

```env
NEXT_PUBLIC_DATA_MODE=mock
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ENABLE_MOCK_ERRORS=false
NEXT_PUBLIC_MEDIA_DEBUG=false
```

Set `NEXT_PUBLIC_MEDIA_DEBUG=true` only while diagnosing playback. It enables
concise media lifecycle, source, pause, and programmatic-seek diagnostics in
development builds.

Mock analysis waits briefly, responds according to the selected event label, identifies itself as `mock-rugby-vlm`, and explicitly notes that visual inference is simulated.

## API mode

Set `NEXT_PUBLIC_DATA_MODE=api`. The visual application remains unchanged; the factory selects the API repositories. Prepared contracts expect:

```http
POST /api/v1/videos
POST /api/v1/videos/{videoId}/events/detect
GET /api/v1/videos/{videoId}/events
POST /api/v1/analysis
```

Zod validates all external event and analysis responses.

## Selected-event clip preview

Clip extraction is lazy. Selecting, detecting, moving, or resizing an event does
not create media. For uploaded videos, **Preview clip** calls the temporary
`POST /videos/{video_id}/clips/preview` endpoint. Closing the preview or changing
its event context requests cleanup, and preview media never enters the persistent
clip cache. Question submission alone calls `POST /videos/{video_id}/clips` to
create or reuse a boundary-specific analysis clip and pass its `clipId` onward.

Preview uses its own `idle`, `loading`, `ready`, and `error` state. Persistent
analysis preparation retains its separate `idle`, `extracting`, `ready`, and
`error` state. Changing an event boundary marks only the analysis clip stale.
Questions carry the prepared persistent `clipId` in their request context, but
answers remain clearly mocked while the VLM is offline.

`components/video/video-player.tsx` supplies the same themed custom controls for
both match and preview playback: play/pause, real-media seeking, elapsed time,
volume, fullscreen, and playback speed. Native controls are not used. The match
wrapper retains the imperative `seekTo()` contract, with the HTML video element
remaining the sole playback clock.

## Domain model

The core types are `VideoAsset`, `VideoEvent`, `AnalysisRequest`, `AnalysisResponse`, and `ChatMessage`. Detected timestamps remain immutable in `detectedStart` and `detectedEnd`; adjusted `start` and `end` values are committed only when pointer interaction finishes.

## Project shape

```text
app/            route, providers, theme
components/     layout, video, timeline, event, and analysis UI
lib/            domain schemas and time/boundary utilities
services/       contracts, mock services, API skeletons, factory
stores/         event selection, editing, and per-event chat
public/demo/    precomputed event proposals
tests/          domain and workspace behavior
```

## Future integration

1. Upload a full match and persist a `VideoAsset`.
2. Run V-JEPA2 event detection and return validated proposals.
3. Reuse the implemented on-demand FFmpeg clip extraction service.
4. Send the prepared `clipId`, metadata, and question to Gemma or Qwen-VL.
5. Stream the structured response into the event-scoped analysis record.

## Known limitations

- The bundled demo contains event metadata but no match video.
- Clip extraction is available only for uploaded, processed backend videos.
- Mock answers do not inspect pixels and must not be treated as tactical evidence.
- Backend, V-JEPA2, FFmpeg, and VLM availability indicators are demonstrative.
