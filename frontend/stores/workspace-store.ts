import { create } from "zustand";
import type { ChatMessage, EventClip, VideoAsset, VideoEvent } from "@/lib/domain";

export type EventDetectionStatus = "idle" | "detecting" | "ready" | "error";
export type ClipStatus = "idle" | "extracting" | "ready" | "error";

interface WorkspaceState {
  events: VideoEvent[];
  currentVideo: VideoAsset | null;
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  eventDetectionStatus: EventDetectionStatus;
  eventDetectionError: string | null;
  selectedClip: EventClip | null;
  clipStatus: ClipStatus;
  clipError: string | null;
  setEvents: (events: VideoEvent[]) => void;
  setCurrentVideo: (video: VideoAsset) => void;
  selectEvent: (id: string) => void;
  updateBounds: (id: string, start: number, end: number) => void;
  replaceEvent: (event: VideoEvent) => void;
  resetBounds: (id: string) => void;
  addMessages: (id: string, messages: ChatMessage[]) => void;
  setEventDetection: (status: EventDetectionStatus, error?: string | null) => void;
  setClipState: (status: ClipStatus, clip?: EventClip | null, error?: string | null) => void;
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
  selectedClip: null,
  clipStatus: "idle",
  clipError: null,
  setEvents: (events) =>
    set({ events, selectedId: events[0]?.id ?? null, chats: {}, selectedClip: null, clipStatus: "idle", clipError: null }),
  setCurrentVideo: (currentVideo) =>
    set({
      currentVideo,
      events: [],
      selectedId: null,
      chats: {},
      eventDetectionStatus: "idle",
      eventDetectionError: null,
      selectedClip: null,
      clipStatus: "idle",
      clipError: null,
    }),
  selectEvent: (selectedId) => set((state) => ({
    selectedId,
    selectedClip: state.selectedClip?.eventId === selectedId ? state.selectedClip : null,
    clipStatus: state.selectedClip?.eventId === selectedId ? state.clipStatus : "idle",
    clipError: null,
  })),
  updateBounds: (id, start, end) =>
    set((state) => {
      const stale = state.selectedClip?.eventId === id
        && (state.selectedClip.start !== start || state.selectedClip.end !== end);
      return {
        events: state.events.map((event) =>
          event.id === id ? { ...event, start, end, adjusted: true } : event,
        ),
        selectedClip: stale ? null : state.selectedClip,
        clipStatus: stale ? "idle" : state.clipStatus,
        clipError: stale ? null : state.clipError,
      };
    }),
  replaceEvent: (updated) =>
    set((state) => {
      const stale = state.selectedClip?.eventId === updated.id
        && (state.selectedClip.start !== updated.start || state.selectedClip.end !== updated.end);
      return {
        events: state.events.map((event) => event.id === updated.id ? updated : event),
        selectedClip: stale ? null : state.selectedClip,
        clipStatus: stale ? "idle" : state.clipStatus,
        clipError: stale ? null : state.clipError,
      };
    }),
  resetBounds: (id) =>
    set((state) => {
      const event = state.events.find((item) => item.id === id);
      const stale = Boolean(event && state.selectedClip?.eventId === id
        && (state.selectedClip.start !== event.detectedStart
          || state.selectedClip.end !== event.detectedEnd));
      return {
        events: state.events.map((event) =>
          event.id === id
            ? { ...event, start: event.detectedStart, end: event.detectedEnd, adjusted: false }
            : event,
        ),
        selectedClip: stale ? null : state.selectedClip,
        clipStatus: stale ? "idle" : state.clipStatus,
        clipError: stale ? null : state.clipError,
      };
    }),
  addMessages: (id, messages) =>
    set((state) => ({
      chats: { ...state.chats, [id]: [...(state.chats[id] ?? []), ...messages] },
    })),
  setEventDetection: (eventDetectionStatus, eventDetectionError = null) =>
    set({ eventDetectionStatus, eventDetectionError }),
  setClipState: (clipStatus, selectedClip = null, clipError = null) =>
    set({ clipStatus, selectedClip, clipError }),
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
        selectedClip: null,
        clipStatus: "idle",
        clipError: null,
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
    selectedClip: null,
    clipStatus: "idle",
    clipError: null,
  }),
}));
