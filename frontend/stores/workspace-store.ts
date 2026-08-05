import { create } from "zustand";
import type { ChatMessage, EventClip, VideoAsset, VideoEvent } from "@/lib/domain";

export type EventDetectionStatus = "idle" | "detecting" | "ready" | "error";
export type ClipStatus = "idle" | "extracting" | "ready" | "error";

interface WorkspaceState {
  events: VideoEvent[];
  currentVideo: VideoAsset | null;
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  conversationIds: Record<string, string>;
  eventDetectionStatus: EventDetectionStatus;
  eventDetectionError: string | null;
  selectedClip: EventClip | null;
  clipsByEvent: Record<string, EventClip>;
  clipStatus: ClipStatus;
  clipError: string | null;
  setEvents: (events: VideoEvent[]) => void;
  setCurrentVideo: (video: VideoAsset) => void;
  selectEvent: (id: string) => void;
  updateBounds: (id: string, start: number, end: number) => void;
  replaceEvent: (event: VideoEvent) => void;
  resetBounds: (id: string) => void;
  addMessages: (id: string, messages: ChatMessage[]) => void;
  setMessages: (id: string, messages: ChatMessage[]) => void;
  setConversationId: (id: string, conversationId: string) => void;
  clearConversation: (id: string) => void;
  setAvailableClips: (clips: EventClip[]) => void;
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
  conversationIds: {},
  eventDetectionStatus: "idle",
  eventDetectionError: null,
  selectedClip: null,
  clipsByEvent: {},
  clipStatus: "idle",
  clipError: null,
  setEvents: (events) =>
    set({ events, selectedId: events[0]?.id ?? null, chats: {}, conversationIds: {}, selectedClip: null, clipsByEvent: {}, clipStatus: "idle", clipError: null }),
  setCurrentVideo: (currentVideo) =>
    set({
      currentVideo,
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
    }),
  selectEvent: (selectedId) => set((state) => ({
    selectedId,
    selectedClip: state.clipsByEvent[selectedId] ?? null,
    clipStatus: state.clipsByEvent[selectedId] ? "ready" : "idle",
    clipError: null,
  })),
  updateBounds: (id, start, end) =>
    set((state) => {
      const preparedClip = state.clipsByEvent[id];
      const stale = Boolean(preparedClip
        && (preparedClip.start !== start || preparedClip.end !== end));
      const selectedClipStale = stale && state.selectedClip?.eventId === id;
      return {
        events: state.events.map((event) =>
          event.id === id ? { ...event, start, end, adjusted: true } : event,
        ),
        selectedClip: selectedClipStale ? null : state.selectedClip,
        clipsByEvent: stale
          ? omitKey(state.clipsByEvent, id)
          : state.clipsByEvent,
        clipStatus: selectedClipStale ? "idle" : state.clipStatus,
        clipError: selectedClipStale ? null : state.clipError,
      };
    }),
  replaceEvent: (updated) =>
    set((state) => {
      const preparedClip = state.clipsByEvent[updated.id];
      const stale = Boolean(preparedClip
        && (preparedClip.start !== updated.start || preparedClip.end !== updated.end));
      const selectedClipStale = stale && state.selectedClip?.eventId === updated.id;
      return {
        events: state.events.map((event) => event.id === updated.id ? updated : event),
        selectedClip: selectedClipStale ? null : state.selectedClip,
        clipsByEvent: stale
          ? omitKey(state.clipsByEvent, updated.id)
          : state.clipsByEvent,
        clipStatus: selectedClipStale ? "idle" : state.clipStatus,
        clipError: selectedClipStale ? null : state.clipError,
      };
    }),
  resetBounds: (id) =>
    set((state) => {
      const event = state.events.find((item) => item.id === id);
      const preparedClip = state.clipsByEvent[id];
      const stale = Boolean(event && preparedClip
        && (preparedClip.start !== event.detectedStart
          || preparedClip.end !== event.detectedEnd));
      const selectedClipStale = stale && state.selectedClip?.eventId === id;
      return {
        events: state.events.map((event) =>
          event.id === id
            ? { ...event, start: event.detectedStart, end: event.detectedEnd, adjusted: false }
            : event,
        ),
        selectedClip: selectedClipStale ? null : state.selectedClip,
        clipsByEvent: stale
          ? omitKey(state.clipsByEvent, id)
          : state.clipsByEvent,
        clipStatus: selectedClipStale ? "idle" : state.clipStatus,
        clipError: selectedClipStale ? null : state.clipError,
      };
    }),
  addMessages: (id, messages) =>
    set((state) => ({
      chats: { ...state.chats, [id]: [...(state.chats[id] ?? []), ...messages] },
    })),
  setMessages: (id, messages) =>
    set((state) => ({ chats: { ...state.chats, [id]: messages } })),
  setConversationId: (id, conversationId) =>
    set((state) => ({
      conversationIds: { ...state.conversationIds, [id]: conversationId },
    })),
  clearConversation: (id) =>
    set((state) => ({
      chats: omitKey(state.chats, id),
      conversationIds: omitKey(state.conversationIds, id),
    })),
  setAvailableClips: (clips) =>
    set((state) => {
      const clipsByEvent = clips.reduce<Record<string, EventClip>>((result, clip) => {
        const event = state.events.find((item) => item.id === clip.eventId);
        if (
          event
          && clip.start === Number(event.start.toFixed(3))
          && clip.end === Number(event.end.toFixed(3))
        ) {
          result[clip.eventId] = clip;
        }
        return result;
      }, { ...state.clipsByEvent });
      const selectedClip = state.selectedId
        ? clipsByEvent[state.selectedId] ?? state.selectedClip
        : state.selectedClip;
      return {
        clipsByEvent,
        selectedClip,
        clipStatus: selectedClip ? "ready" : state.clipStatus,
      };
    }),
  setEventDetection: (eventDetectionStatus, eventDetectionError = null) =>
    set({ eventDetectionStatus, eventDetectionError }),
  setClipState: (clipStatus, selectedClip = null, clipError = null) =>
    set((state) => ({
      clipStatus,
      selectedClip,
      clipError,
      clipsByEvent: selectedClip
        ? { ...state.clipsByEvent, [selectedClip.eventId]: selectedClip }
        : state.clipsByEvent,
    })),
  detectEventsForVideo: async (videoId, detector) => {
    set({ eventDetectionStatus: "detecting", eventDetectionError: null });
    try {
      const events = await detector(videoId);
      set({
        events,
        selectedId: events[0]?.id ?? null,
        chats: {},
        conversationIds: {},
        eventDetectionStatus: "ready",
        eventDetectionError: null,
        selectedClip: null,
        clipsByEvent: {},
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
    conversationIds: {},
    eventDetectionStatus: "idle",
    eventDetectionError: null,
    selectedClip: null,
    clipsByEvent: {},
    clipStatus: "idle",
    clipError: null,
  }),
}));

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}
