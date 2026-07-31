import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspaceStore } from "@/stores/workspace-store";
import type { VideoEvent } from "@/lib/domain";

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
  beforeEach(() => useWorkspaceStore.setState({ events: [], selectedId: null, chats: {} }));

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
});
