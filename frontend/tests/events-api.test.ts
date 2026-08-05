import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectEvents, updateEventBoundaries, uploadVideo } from "@/services/api";

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
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis_config: { event_detector: "mock" },
        }),
      },
    );
    expect(events[0]).toMatchObject({
      id: "event_001",
      videoId,
      detectedStart: 42,
      detectedEnd: 55,
    });
  });

  it("forwards a selected detector instead of replacing it with the default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      video_id: videoId,
      status: "ready",
      detector: "vjepa2",
      created_at: "2026-08-03T12:00:00Z",
      events: [],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await detectEvents(videoId, { eventDetector: "vjepa2" });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/videos/${videoId}/events/detect`,
      expect.objectContaining({
        body: JSON.stringify({
          analysis_config: { event_detector: "vjepa2" },
        }),
      }),
    );
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

  it("includes the selected detector in the multipart upload configuration", async () => {
    const listeners = new Map<string, () => void>();
    let submitted: FormData | null = null;
    class FakeXMLHttpRequest {
      status = 201;
      response = {
        video_id: videoId,
        filename: "match.mp4",
        status: "processed",
        stream_url: `/videos/${videoId}/stream`,
        duration: 180,
        size: 100,
      };
      responseType = "";
      upload = { addEventListener: vi.fn() };
      open = vi.fn();
      addEventListener(name: string, listener: () => void) {
        listeners.set(name, listener);
      }
      send(body: FormData) {
        submitted = body;
        listeners.get("load")?.();
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeXMLHttpRequest);

    await uploadVideo(new File(["video"], "match.mp4"), {
      eventDetector: "mock",
    });

    expect(submitted).not.toBeNull();
    expect((submitted as FormData).get("analysis_config")).toBe(
      JSON.stringify({ event_detector: "mock" }),
    );
  });
});
