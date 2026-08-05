import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { EventClip, VideoEvent } from "@/lib/domain";

const event: VideoEvent = {
  id: "event_001",
  label: "Scrum",
  start: 42,
  end: 55,
  confidence: 0.92,
  detectedStart: 42,
  detectedEnd: 55,
};

describe("workspace store", () => {
  beforeEach(() => useWorkspaceStore.setState({
    currentVideo: null,
    events: [],
    selectedId: null,
    chats: {},
    conversationIds: {},
    eventDetectionStatus: "idle",
    eventDetectionError: null,
    selectedClip: null,
    clipsByEvent: {},
    clipStatus: "idle",
    clipError: null,
  }));

  it("selects, adjusts, and resets event boundaries", () => {
    useWorkspaceStore.getState().setEvents([event]);
    useWorkspaceStore.getState().updateBounds(event.id, 40, 58);
    expect(useWorkspaceStore.getState().events[0].start).toBe(40);
    useWorkspaceStore.getState().resetBounds(event.id);
    expect(useWorkspaceStore.getState().events[0]).toMatchObject({ start: 42, end: 55 });
  });

  it("keeps chat history grouped by event", () => {
    useWorkspaceStore.getState().addMessages(event.id, [{
      id: "message_1",
      role: "user",
      content: "What happened?",
      createdAt: "2026-07-31T08:00:00.000Z",
    }]);
    expect(useWorkspaceStore.getState().chats[event.id]).toHaveLength(1);
  });

  it("makes an uploaded video current and clears demo event context", () => {
    useWorkspaceStore.getState().setEvents([event]);
    useWorkspaceStore.getState().setCurrentVideo({
      id: "match_20260803_abcd1234",
      name: "uploaded-match.mp4",
      url: "http://localhost:8000/videos/match_20260803_abcd1234/stream",
      duration: 2400,
      size: 1024,
    });

    expect(useWorkspaceStore.getState().currentVideo?.name).toBe("uploaded-match.mp4");
    expect(useWorkspaceStore.getState().events).toEqual([]);
    expect(useWorkspaceStore.getState().selectedId).toBeNull();
  });

  it("tracks uploaded-video detection and stores returned events", async () => {
    let finishDetection: ((events: VideoEvent[]) => void) | undefined;
    const detector = vi.fn(() => new Promise<VideoEvent[]>((resolve) => {
      finishDetection = resolve;
    }));

    const detection = useWorkspaceStore.getState().detectEventsForVideo(
      "match_20260803_abcd1234",
      detector,
    );
    expect(useWorkspaceStore.getState().eventDetectionStatus).toBe("detecting");
    finishDetection?.([event]);
    await detection;

    expect(detector).toHaveBeenCalledOnce();
    expect(useWorkspaceStore.getState().eventDetectionStatus).toBe("ready");
    expect(useWorkspaceStore.getState().events).toEqual([event]);
    expect(useWorkspaceStore.getState().selectedId).toBe(event.id);
  });

  it("retains a retryable detection failure state", async () => {
    const detector = vi.fn().mockRejectedValue(new Error("Detector unavailable"));
    await expect(useWorkspaceStore.getState().detectEventsForVideo(
      "match_20260803_abcd1234",
      detector,
    )).rejects.toThrow("Detector unavailable");

    expect(useWorkspaceStore.getState().eventDetectionStatus).toBe("error");
    expect(useWorkspaceStore.getState().eventDetectionError).toBe("Detector unavailable");
  });

  it("marks a prepared clip stale without extracting when boundaries change", () => {
    const clip: EventClip = {
      clipId: "clip_event_001_abcd1234",
      videoId: "match_20260803_abcd1234",
      eventId: event.id,
      eventLabel: event.label,
      start: event.start,
      end: event.end,
      duration: event.end - event.start,
      status: "ready",
      streamUrl: "http://backend.test/clip.mp4",
      extractionProfile: "accurate-h264-v1",
      createdAt: "2026-08-03T20:00:00Z",
      cached: false,
    };
    useWorkspaceStore.getState().setEvents([event]);
    useWorkspaceStore.getState().setClipState("ready", clip);
    useWorkspaceStore.getState().updateBounds(event.id, 40, 58);

    expect(useWorkspaceStore.getState().selectedClip).toBeNull();
    expect(useWorkspaceStore.getState().clipStatus).toBe("idle");
  });

  it("restores clip-scoped conversations without mixing selected events", () => {
    const secondEvent = { ...event, id: "event_002", label: "Lineout" as const };
    const firstClip: EventClip = {
      clipId: "clip_one",
      videoId: "match_20260803_abcd1234",
      eventId: event.id,
      eventLabel: event.label,
      start: event.start,
      end: event.end,
      duration: event.end - event.start,
      status: "ready",
      streamUrl: "http://backend.test/clip-one.mp4",
      extractionProfile: "accurate-h264-v1",
      createdAt: "2026-08-05T12:00:00Z",
      cached: true,
    };
    const secondClip = {
      ...firstClip,
      clipId: "clip_two",
      eventId: secondEvent.id,
      eventLabel: secondEvent.label,
    };
    useWorkspaceStore.getState().setEvents([event, secondEvent]);
    useWorkspaceStore.getState().setClipState("ready", firstClip);
    useWorkspaceStore.getState().addMessages(firstClip.clipId, [{
      id: "first_message",
      role: "assistant",
      content: "First conversation",
      createdAt: "2026-08-05T12:00:00Z",
    }]);
    useWorkspaceStore.getState().selectEvent(secondEvent.id);
    useWorkspaceStore.getState().setClipState("ready", secondClip);
    useWorkspaceStore.getState().addMessages(secondClip.clipId, [{
      id: "second_message",
      role: "assistant",
      content: "Second conversation",
      createdAt: "2026-08-05T12:01:00Z",
    }]);

    useWorkspaceStore.getState().selectEvent(event.id);
    expect(useWorkspaceStore.getState().selectedClip?.clipId).toBe("clip_one");
    expect(useWorkspaceStore.getState().chats.clip_one[0].content).toBe("First conversation");
    expect(useWorkspaceStore.getState().chats.clip_two[0].content).toBe("Second conversation");
  });

  it("clears one conversation while preserving the selected clip", () => {
    const clip: EventClip = {
      clipId: "clip_one",
      videoId: "match_20260803_abcd1234",
      eventId: event.id,
      eventLabel: event.label,
      start: event.start,
      end: event.end,
      duration: event.end - event.start,
      status: "ready",
      streamUrl: "http://backend.test/clip-one.mp4",
      extractionProfile: "accurate-h264-v1",
      createdAt: "2026-08-05T12:00:00Z",
      cached: true,
    };
    useWorkspaceStore.getState().setEvents([event]);
    useWorkspaceStore.getState().setClipState("ready", clip);
    useWorkspaceStore.getState().setMessages(clip.clipId, [{
      id: "message_1",
      role: "assistant",
      content: "Answer",
      createdAt: "2026-08-05T12:00:00Z",
    }]);
    useWorkspaceStore.getState().setConversationId(clip.clipId, "conv_001");

    useWorkspaceStore.getState().clearConversation(clip.clipId);

    expect(useWorkspaceStore.getState().chats[clip.clipId]).toBeUndefined();
    expect(useWorkspaceStore.getState().conversationIds[clip.clipId]).toBeUndefined();
    expect(useWorkspaceStore.getState().selectedClip).toEqual(clip);
  });
});
