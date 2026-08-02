import { create } from "zustand";
import type { ChatMessage, VideoEvent } from "@/lib/domain";

interface WorkspaceState {
  events: VideoEvent[];
  selectedId: string | null;
  chats: Record<string, ChatMessage[]>;
  setEvents: (events: VideoEvent[]) => void;
  selectEvent: (id: string) => void;
  updateBounds: (id: string, start: number, end: number) => void;
  resetBounds: (id: string) => void;
  addMessages: (id: string, messages: ChatMessage[]) => void;
  reset: () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  events: [],
  selectedId: null,
  chats: {},
  setEvents: (events) =>
    set({ events, selectedId: events[0]?.id ?? null, chats: {} }),
  selectEvent: (selectedId) => set({ selectedId }),
  updateBounds: (id, start, end) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === id ? { ...event, start, end } : event,
      ),
    })),
  resetBounds: (id) =>
    set((state) => ({
      events: state.events.map((event) =>
        event.id === id
          ? { ...event, start: event.detectedStart, end: event.detectedEnd }
          : event,
      ),
    })),
  addMessages: (id, messages) =>
    set((state) => ({
      chats: { ...state.chats, [id]: [...(state.chats[id] ?? []), ...messages] },
    })),
  reset: () => set({ selectedId: null, events: [], chats: {} }),
}));
