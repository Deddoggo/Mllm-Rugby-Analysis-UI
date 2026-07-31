export const MIN_EVENT_DURATION = 2;
export const MAX_EVENT_DURATION = 60;

export function formatTime(seconds: number, tenths = false) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder
    .toFixed(tenths ? 1 : 0)
    .padStart(tenths ? 4 : 2, "0")}`;
}

export function validateBounds(start: number, end: number, duration: number) {
  const nextStart = Math.max(0, Math.min(start, duration - MIN_EVENT_DURATION));
  const nextEnd = Math.min(duration, Math.max(end, nextStart + MIN_EVENT_DURATION));
  if (nextEnd - nextStart > MAX_EVENT_DURATION) {
    return { start: nextStart, end: nextStart + MAX_EVENT_DURATION };
  }
  return { start: nextStart, end: nextEnd };
}
