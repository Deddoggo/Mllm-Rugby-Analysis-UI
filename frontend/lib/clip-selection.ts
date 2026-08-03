import type { EventClip, VideoEvent } from "@/lib/domain";

export function clipMatchesEvent(clip: EventClip | null, event: VideoEvent) {
  return clip?.eventId === event.id
    && clip.start === Number(event.start.toFixed(3))
    && clip.end === Number(event.end.toFixed(3));
}

export async function prepareEventClip({
  videoId,
  event,
  currentClip,
  create,
  onState,
}: {
  videoId: string;
  event: VideoEvent;
  currentClip: EventClip | null;
  create: (videoId: string, eventId: string) => Promise<EventClip>;
  onState: (status: "extracting" | "ready" | "error", clip: EventClip | null, error: string | null) => void;
}) {
  if (clipMatchesEvent(currentClip, event)) return currentClip;
  onState("extracting", null, null);
  try {
    const clip = await create(videoId, event.id);
    onState("ready", clip, null);
    return clip;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Clip extraction failed.";
    onState("error", null, message);
    throw caught;
  }
}
