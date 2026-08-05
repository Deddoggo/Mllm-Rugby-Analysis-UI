// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClipPreview } from "@/components/analysis/clip-preview";
import type { EventClip, TemporaryClipPreview, VideoEvent } from "@/lib/domain";
import { prepareEventClip } from "@/lib/clip-selection";
import {
  createClip,
  createClipPreview,
  deleteClipPreview,
  listClips,
} from "@/services/api";
import { render } from "./render";

const videoId = "match_20260803_abcd1234";
const event: VideoEvent = {
  id: "event_001",
  videoId,
  label: "Scrum",
  start: 42,
  end: 55,
  confidence: 0.92,
  detectedStart: 42,
  detectedEnd: 55,
};
const apiClip = {
  clip_id: "clip_event_001_abcd1234",
  video_id: videoId,
  event_id: event.id,
  event_label: event.label,
  start: 42,
  end: 55,
  duration: 13,
  status: "ready",
  stream_url: `/videos/${videoId}/clips/clip_event_001_abcd1234/stream`,
  extraction_profile: "accurate-h264-v1",
  created_at: "2026-08-03T20:00:00Z",
  cached: false,
} as const;
const clip: EventClip = {
  clipId: apiClip.clip_id,
  videoId,
  eventId: event.id,
  eventLabel: event.label,
  start: 42,
  end: 55,
  duration: 13,
  status: "ready",
  streamUrl: `http://backend.test${apiClip.stream_url}`,
  extractionProfile: "accurate-h264-v1",
  createdAt: apiClip.created_at,
  cached: false,
};
const apiPreview = {
  preview_id: "preview_abcd1234",
  video_id: videoId,
  event_id: event.id,
  event_label: event.label,
  start: 42,
  end: 55,
  duration: 13,
  status: "ready",
  stream_url: `/videos/${videoId}/clips/preview/preview_abcd1234/stream`,
  temporary: true,
} as const;
const temporaryPreview: TemporaryClipPreview = {
  previewId: apiPreview.preview_id,
  videoId,
  eventId: event.id,
  eventLabel: event.label,
  start: 42,
  end: 55,
  duration: 13,
  status: "ready",
  streamUrl: `http://backend.test${apiPreview.stream_url}`,
  temporary: true,
};

describe("clip API and lazy preparation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://backend.test";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("sends only event_id and force, then maps the stream URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(apiClip), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const created = await createClip(videoId, event.id);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/videos/${videoId}/clips`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ event_id: event.id, force: false }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).not.toContain("start");
    expect(created.streamUrl).toBe(`http://backend.test${apiClip.stream_url}`);
  });

  it("maps valid cached clip lists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      video_id: videoId,
      clips: [{ ...apiClip, cached: true }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })));
    expect((await listClips(videoId))[0].cached).toBe(true);
  });

  it("uses a separate temporary preview endpoint without persistent clip fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(apiPreview), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const preview = await createClipPreview(videoId, event.id);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `http://backend.test/videos/${videoId}/clips/preview`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ event_id: event.id }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).not.toContain("force");
    expect(preview).toEqual(temporaryPreview);

    await deleteClipPreview(videoId, preview.previewId);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `http://backend.test/videos/${videoId}/clips/preview/${preview.previewId}`,
      { method: "DELETE" },
    );
  });

  it("does not extract for selection and prepares exactly once on explicit use", async () => {
    const create = vi.fn().mockResolvedValue(clip);
    const onState = vi.fn();
    expect(create).not.toHaveBeenCalled();

    const prepared = await prepareEventClip({
      videoId,
      event,
      currentClip: null,
      create,
      onState,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledWith(videoId, event.id);
    expect(onState.mock.calls[0][0]).toBe("extracting");
    expect(onState.mock.calls[1]).toEqual(["ready", clip, null]);
    expect(prepared).toBe(clip);
  });

  it("reuses a boundary-matching clip and requests a new one after a boundary change", async () => {
    const create = vi.fn().mockResolvedValue({ ...clip, end: 60, duration: 18 });
    const onState = vi.fn();
    expect(await prepareEventClip({ videoId, event, currentClip: clip, create, onState })).toBe(clip);
    expect(create).not.toHaveBeenCalled();
    await prepareEventClip({
      videoId,
      event: { ...event, end: 60 },
      currentClip: clip,
      create,
      onState,
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("keeps extraction errors scoped to clip state", async () => {
    const onState = vi.fn();
    await expect(prepareEventClip({
      videoId,
      event,
      currentClip: null,
      create: vi.fn().mockRejectedValue(new Error("FFmpeg unavailable")),
      onState,
    })).rejects.toThrow("FFmpeg unavailable");
    expect(onState).toHaveBeenLastCalledWith("error", null, "FFmpeg unavailable");
  });
});

describe("clip preview", () => {
  afterEach(cleanup);

  it("shows temporary loading state and the shared custom stream player", () => {
    const props = { event, error: null, onClose: vi.fn(), onRetry: vi.fn() };
    const { rerender } = render(<ClipPreview {...props} clip={null} status="loading" />);
    expect(screen.getByText("Preparing temporary preview…")).toBeTruthy();

    rerender(<ClipPreview {...props} clip={temporaryPreview} status="ready" />);
    const preview = screen.getByTestId("clip-preview-video") as HTMLVideoElement;
    expect(preview.getAttribute("src")).toBe(temporaryPreview.streamUrl);
    expect(preview.hasAttribute("controls")).toBe(false);
    expect(preview.closest(".video-player-preview")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Seek video" })).toBeTruthy();
    expect(screen.getByText("Not saved to analysis cache")).toBeTruthy();
    expect(screen.getByText("Preview only · no VLM request")).toBeTruthy();
  });
});
