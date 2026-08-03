import type { VideoEvent } from "@/lib/domain";
import { normalizeEventBoundaries } from "@/lib/time";

interface PersistEventBoundariesOptions {
  original: VideoEvent;
  start: number;
  end: number;
  videoDuration: number;
  updateLocal: (id: string, start: number, end: number) => void;
  replaceLocal: (event: VideoEvent) => void;
  persist: (id: string, start: number, end: number) => Promise<VideoEvent>;
}

export async function persistEventBoundaries({
  original,
  start,
  end,
  videoDuration,
  updateLocal,
  replaceLocal,
  persist,
}: PersistEventBoundariesOptions): Promise<VideoEvent> {
  const normalized = normalizeEventBoundaries({
    kind: "normalize",
    start,
    end,
    videoDuration,
  });
  updateLocal(original.id, normalized.start, normalized.end);

  try {
    const persisted = await persist(original.id, normalized.start, normalized.end);
    replaceLocal(persisted);
    return persisted;
  } catch (error) {
    replaceLocal(original);
    throw error;
  }
}

export function getBoundaryPersistenceErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /duration|boundary|422|validation/i.test(message)
    ? "Event boundaries must stay between 2 and 60 seconds. Previous values were restored."
    : "Event boundaries could not be saved. Previous values were restored.";
}
