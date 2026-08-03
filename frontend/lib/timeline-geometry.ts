export interface TimelineGeometry {
  leftPercent: number;
  widthPercent: number;
}

export interface TimelinePixelGeometry {
  leftPx: number;
  trueWidthPx: number;
  hitboxLeftPx: number;
  hitboxWidthPx: number;
}

export const MIN_EVENT_HITBOX_PX = 16;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export function timeToPixel(
  time: number,
  visibleStart: number,
  visibleEnd: number,
  contentWidth: number,
) {
  const visibleDuration = Math.max(Number.EPSILON, visibleEnd - visibleStart);
  return ((time - visibleStart) / visibleDuration) * Math.max(0, contentWidth);
}

export function pixelToTime(
  pixel: number,
  visibleStart: number,
  visibleEnd: number,
  contentWidth: number,
) {
  const safeWidth = Math.max(Number.EPSILON, contentWidth);
  return visibleStart + (pixel / safeWidth) * (visibleEnd - visibleStart);
}

export function getTimelinePixelGeometry(
  start: number,
  end: number,
  visibleStart: number,
  visibleEnd: number,
  contentWidth: number,
  minimumHitboxPx = MIN_EVENT_HITBOX_PX,
): TimelinePixelGeometry {
  const safeWidth = Math.max(0, contentWidth);
  const leftPx = clamp(timeToPixel(start, visibleStart, visibleEnd, safeWidth), 0, safeWidth);
  const endPx = clamp(timeToPixel(end, visibleStart, visibleEnd, safeWidth), leftPx, safeWidth);
  const trueWidthPx = endPx - leftPx;
  const hitboxWidthPx = Math.min(safeWidth, Math.max(trueWidthPx, minimumHitboxPx));
  const hitboxLeftPx = clamp(
    leftPx + (trueWidthPx - hitboxWidthPx) / 2,
    0,
    Math.max(0, safeWidth - hitboxWidthPx),
  );

  return { leftPx, trueWidthPx, hitboxLeftPx, hitboxWidthPx };
}

export function getTimelineGeometry(
  start: number,
  end: number,
  visibleStart: number,
  visibleEnd: number,
): TimelineGeometry {
  const pixels = getTimelinePixelGeometry(start, end, visibleStart, visibleEnd, 100, 0);
  return {
    leftPercent: pixels.leftPx,
    widthPercent: pixels.trueWidthPx,
  };
}

export function getSelectedDetailRange(
  start: number,
  end: number,
  videoDuration: number,
  contextSeconds = 15,
) {
  const safeDuration = Math.max(0, videoDuration);
  // Keep enough room to grow any event to the 60-second domain maximum while
  // retaining the requested context on both sides.
  const minimumEditingWindow = 60 + contextSeconds * 2;
  const desiredDuration = Math.min(
    safeDuration,
    Math.max(minimumEditingWindow, Math.max(0, end - start) + contextSeconds * 2),
  );
  const visibleStart = clamp(start - contextSeconds, 0, Math.max(0, safeDuration - desiredDuration));
  return { visibleStart, visibleEnd: visibleStart + desiredDuration };
}
