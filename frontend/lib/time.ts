export const MIN_EVENT_DURATION_SECONDS = 2;
export const MAX_EVENT_DURATION_SECONDS = 60;
export const EVENT_TIME_PRECISION = 3;

// Backward-compatible aliases for existing domain callers.
export const MIN_EVENT_DURATION = MIN_EVENT_DURATION_SECONDS;
export const MAX_EVENT_DURATION = MAX_EVENT_DURATION_SECONDS;

export type BoundaryOperation = "resize-start" | "resize-end" | "move" | "normalize";

interface NormalizeEventBoundariesOptions {
  kind: BoundaryOperation;
  start: number;
  end: number;
  videoDuration: number;
  pointerTime?: number;
  targetStart?: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function roundEventTime(seconds: number) {
  const scale = 10 ** EVENT_TIME_PRECISION;
  return Math.round((seconds + Number.EPSILON) * scale) / scale;
}

function finalizeInterval(start: number, end: number, videoDuration: number) {
  const safeDuration = Math.max(MIN_EVENT_DURATION_SECONDS, roundEventTime(videoDuration));
  let nextStart = clamp(roundEventTime(start), 0, safeDuration - MIN_EVENT_DURATION_SECONDS);
  let nextEnd = clamp(roundEventTime(end), nextStart + MIN_EVENT_DURATION_SECONDS, safeDuration);

  if (roundEventTime(nextEnd - nextStart) > MAX_EVENT_DURATION_SECONDS) {
    nextEnd = Math.min(safeDuration, roundEventTime(nextStart + MAX_EVENT_DURATION_SECONDS));
  }

  // Rounding each endpoint can otherwise leave a binary-float interval a few
  // ulps over 60 even though the displayed duration is exactly 60.000.
  if (nextEnd - nextStart > MAX_EVENT_DURATION_SECONDS) {
    nextEnd = roundEventTime(nextStart + MAX_EVENT_DURATION_SECONDS);
  }

  nextStart = roundEventTime(nextStart);
  nextEnd = roundEventTime(nextEnd);
  return { start: nextStart, end: nextEnd };
}

export function normalizeEventBoundaries({
  kind,
  start,
  end,
  videoDuration,
  pointerTime,
  targetStart,
}: NormalizeEventBoundariesOptions) {
  const safeDuration = Math.max(MIN_EVENT_DURATION_SECONDS, roundEventTime(videoDuration));
  const normalized = finalizeInterval(start, end, safeDuration);

  if (kind === "resize-end") {
    const fixedStart = normalized.start;
    const maximumEnd = Math.min(fixedStart + MAX_EVENT_DURATION_SECONDS, safeDuration);
    const nextEnd = clamp(
      pointerTime ?? normalized.end,
      fixedStart + MIN_EVENT_DURATION_SECONDS,
      maximumEnd,
    );
    return finalizeInterval(fixedStart, nextEnd, safeDuration);
  }

  if (kind === "resize-start") {
    const fixedEnd = normalized.end;
    const minimumStart = Math.max(0, fixedEnd - MAX_EVENT_DURATION_SECONDS);
    const nextStart = clamp(
      pointerTime ?? normalized.start,
      minimumStart,
      fixedEnd - MIN_EVENT_DURATION_SECONDS,
    );
    return finalizeInterval(nextStart, fixedEnd, safeDuration);
  }

  if (kind === "move") {
    const intervalDuration = clamp(
      roundEventTime(normalized.end - normalized.start),
      MIN_EVENT_DURATION_SECONDS,
      MAX_EVENT_DURATION_SECONDS,
    );
    const nextStart = clamp(
      targetStart ?? normalized.start,
      0,
      safeDuration - intervalDuration,
    );
    return finalizeInterval(nextStart, nextStart + intervalDuration, safeDuration);
  }

  return normalized;
}

export function formatTime(seconds: number, tenths = false) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder
    .toFixed(tenths ? 1 : 0)
    .padStart(tenths ? 4 : 2, "0")}`;
}

export function validateBounds(start: number, end: number, duration: number) {
  return normalizeEventBoundaries({ kind: "normalize", start, end, videoDuration: duration });
}
