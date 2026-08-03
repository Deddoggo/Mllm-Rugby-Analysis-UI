import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectEvents, updateEventBoundaries } from "@/services/api";

const videoId = "match_20260803_abcd1234";
const apiEvent = {
  id: "event_001",
  video_id: videoId,
  label: "Scrum",
  start: 42,
  end: 55,
  confidence: 0.92,
  detected_start: 42,
  detected_end: 55,
  adjusted: false,
};

describe("event API service", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://backend.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("triggers detection and maps backend boundaries into the frontend domain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      video_id: videoId,
      status: "ready",
      detector: "mock-vjepa2",
      created_at: "2026-08-03T12:00:00Z",
      events: [apiEvent],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const events = await detectEvents(videoId);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/videos/${videoId}/events/detect`,
      { method: "POST" },
    );
    expect(events[0]).toMatchObject({
      id: "event_001",
      videoId,
      detectedStart: 42,
      detectedEnd: 55,
    });
  });

  it("sends exactly one PATCH for a committed boundary change", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ...apiEvent,
      start: 40.5,
      end: 58,
      adjusted: true,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const updated = await updateEventBoundaries(videoId, "event_001", 40.5, 58);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/videos/${videoId}/events/event_001`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ start: 40.5, end: 58 }),
      }),
    );
    expect(updated).toMatchObject({ start: 40.5, end: 58, adjusted: true });
  });
});
