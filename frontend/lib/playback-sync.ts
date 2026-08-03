export type SeekableMedia = Pick<HTMLVideoElement, "currentTime" | "duration">;

export function clampSeekTime(media: SeekableMedia, seconds: number) {
  const requested = Number.isFinite(seconds) ? seconds : 0;
  const upperBound = Number.isFinite(media.duration) && media.duration > 0
    ? media.duration
    : Math.max(0, requested);
  return Math.max(0, Math.min(requested, upperBound));
}

export function seekMediaElement(media: SeekableMedia, seconds: number) {
  const target = clampSeekTime(media, seconds);
  media.currentTime = target;
  return target;
}
