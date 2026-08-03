import { create } from "zustand";
import type { ChatMessage, VideoAsset, VideoEvent } from "@/lib/domain";

export type EventDetectionStatus = "idle" | "detecting" | "ready" | "error";

interface WorkspaceState {
  events: VideoEvent[];
  currentVideo: VideoAsset | null;
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  eventDetectionStatus: EventDetectionStatus;
  eventDetectionError: string | null;
  setEvents: (events: VideoEvent[]) => void;
  setCurrentVideo: (video: VideoAsset) => void;
  selectEvent: (id: string) => void;
  updateBounds: (id: string, start: number, end: number) => void;
  replaceEvent: (event: VideoEvent) => void;
  resetBounds: (id: string) => void;
  addMessages: (id: string, messages: ChatMessage[]) => void;
  setEventDetection: (status: EventDetectionStatus, error?: string | null) => void;
  detectEventsForVideo: (
    videoId: string,
    detector: (videoId: string) => Promise<VideoEvent[]>,
  ) => Promise<void>;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  events: [],
  currentVideo: null,
  selectedId: null,
  chats: {},
  eventDetectionStatus: "idle",
  eventDetectionError: null,
  setEvents: (events) =>
    set({ events, selectedId: events[0]?.id ?? null, chats: {} }),
  setCurrentVideo: (currentVideo) =>
    set({
      currentVideo,
      events: [],
      selectedId: null,
      chats: {},
      eventDetectionStatus: "idle",
      eventDetectionError: null,
    }),
  selectEvent: (selectedId) => set({ selectedId }),
  updateBounds: (id, start, end) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === id ? { ...event, start, end, adjusted: true } : event,
      ),
    })),
  replaceEvent: (updated) =>
    set((state) => ({
      events: state.events.map((event) => event.id === updated.id ? updated : event),
    })),
  resetBounds: (id) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === id
          ? { ...event, start: event.detectedStart, end: event.detectedEnd, adjusted: false }
          : event,
      ),
    })),
  addMessages: (id, messages) =>
    set((state) => ({
      chats: { ...state.chats, [id]: [...(state.chats[id] ?? []), ...messages] },
    })),
  setEventDetection: (eventDetectionStatus, eventDetectionError = null) =>
    set({ eventDetectionStatus, eventDetectionError }),
  detectEventsForVideo: async (videoId, detector) => {
    set({ eventDetectionStatus: "detecting", eventDetectionError: null });
    try {
      const events = await detector(videoId);
      set({
        events,
        selectedId: events[0]?.id ?? null,
        chats: {},
        eventDetectionStatus: "ready",
        eventDetectionError: null,
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Event detection failed.";
      set({ eventDetectionStatus: "error", eventDetectionError: message });
      throw caught;
    }
  },
  reset: () => set({
    currentVideo: null,
    selectedId: null,
    events: [],
    chats: {},
    eventDetectionStatus: "idle",
    eventDetectionError: null,
  }),
}));
