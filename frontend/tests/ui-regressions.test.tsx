// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventTimeline } from "@/components/timeline/event-timeline";
import type { VideoEvent } from "@/lib/domain";
import {
  getBoundaryPersistenceErrorMessage,
  persistEventBoundaries,
} from "@/lib/event-boundary-persistence";
import {
  getSelectedDetailRange,
  getTimelineGeometry,
  getTimelinePixelGeometry,
  pixelToTime,
  timeToPixel,
} from "@/lib/timeline-geometry";
import { normalizeEventBoundaries } from "@/lib/time";

const originalEvent: VideoEvent = {
  id: "event_001",
  videoId: "match_20260803_abcd1234",
  label: "Scrum",
  start: 20,
  end: 35,
  confidence: 0.92,
  detectedStart: 5,
  detectedEnd: 20,
  adjusted: true,
};

const noop = () => undefined;

function TimelineHarness({ event = originalEvent }: { event?: VideoEvent }) {
  const [events, setEvents] = useState([event]);
  return (
    <EventTimeline
      events={events}
      selectedId={event.id}
      current={0}
      duration={100}
      onSelect={noop}
      onSeek={noop}
      onBounds={(id, start, end) => {
        setEvents((current) => current.map((item) =>
          item.id === id ? { ...item, start, end, adjusted: true } : item,
        ));
      }}
      onReset={(id) => {
        setEvents((current) => current.map((item) =>
          item.id === id
            ? { ...item, start: item.detectedStart, end: item.detectedEnd, adjusted: false }
            : item,
        ));
      }}
    />
  );
}

function mockTrackRect(track: HTMLElement, width = 1_000) {
  vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
    bottom: 58,
    height: 58,
    left: 0,
    right: width,
    top: 0,
    width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("timeline event geometry", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(cleanup);

  it("uses adjusted start/end rather than detected boundaries", () => {
    render(<TimelineHarness />);
    const block = screen.getByTestId(`event-block-${originalEvent.id}`);

    expect(block.style.left).toBe("20%");
    expect(block.style.width).toBe("15%");
    expect(block.dataset.eventStart).toBe("20");
    expect(block.dataset.eventEnd).toBe("35");
  });

  it("renders a right-edge draft immediately and commits it once", () => {
    const onBounds = vi.fn();
    render(
      <EventTimeline
        events={[originalEvent]}
        selectedId={originalEvent.id}
        current={0}
        duration={100}
        onSelect={noop}
        onSeek={noop}
        onBounds={onBounds}
        onReset={noop}
      />,
    );
    const track = screen.getByTestId("event-timeline-track");
    const block = screen.getByTestId(`event-block-${originalEvent.id}`);
    mockTrackRect(track);

    fireEvent.pointerDown(screen.getByRole("slider", { name: "Adjust Scrum end" }), {
      clientX: 350,
      pointerId: 1,
    });
    fireEvent.pointerMove(track, { clientX: 650, pointerId: 1 });

    expect(block.style.left).toBe("20%");
    expect(block.style.width).toBe("45%");
    expect(block.dataset.eventEnd).toBe("65");
    expect(onBounds).not.toHaveBeenCalled();

    fireEvent.pointerUp(track, { clientX: 650, pointerId: 1 });
    expect(onBounds).toHaveBeenCalledOnce();
    expect(onBounds).toHaveBeenCalledWith(originalEvent.id, 20, 65);
  });

  it("left-edge resize changes left and width while move preserves width", () => {
    render(<TimelineHarness />);
    const track = screen.getByTestId("event-timeline-track");
    const block = screen.getByTestId(`event-block-${originalEvent.id}`);
    mockTrackRect(track);

    fireEvent.pointerDown(screen.getByRole("slider", { name: "Adjust Scrum start" }), {
      clientX: 200,
      pointerId: 2,
    });
    fireEvent.pointerMove(track, { clientX: 100, pointerId: 2 });
    expect(block.style.left).toBe("10%");
    expect(block.style.width).toBe("25%");
    fireEvent.pointerUp(track, { clientX: 100, pointerId: 2 });

    fireEvent.pointerDown(screen.getByTestId(`event-hitbox-${originalEvent.id}`), { clientX: 100, pointerId: 3 });
    fireEvent.pointerMove(track, { clientX: 200, pointerId: 3 });
    expect(block.style.left).toBe("20%");
    expect(block.style.width).toBe("25%");
  });

  it("keeps full-duration percentages consistent when zoom changes", () => {
    render(<TimelineHarness />);
    const block = screen.getByTestId(`event-block-${originalEvent.id}`);
    const canvas = document.querySelector(".timeline-canvas") as HTMLElement;

    expect(canvas.style.width).toBe("100%");
    expect(block.style.width).toBe("15%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(canvas.style.width).toBe("125%");
    expect(block.style.width).toBe("15%");
  });

  it("reset and persisted adjusted events render their effective geometry", () => {
    render(<TimelineHarness />);
    const block = screen.getByTestId(`event-block-${originalEvent.id}`);
    expect(block.style.width).toBe("15%");

    fireEvent.click(screen.getByRole("button", { name: "Reset selected" }));
    expect(block.style.left).toBe("5%");
    expect(block.style.width).toBe("15%");
  });

  it("clamps geometry to the visible range", () => {
    expect(getTimelineGeometry(-10, 120, 0, 100)).toEqual({
      leftPercent: 0,
      widthPercent: 100,
    });
  });

  it("keeps a two-second true bar independent from its minimum hitbox", () => {
    const fiftyMinute = getTimelinePixelGeometry(100, 102, 0, 3_000, 1_000);
    const thirteenMinute = getTimelinePixelGeometry(100, 102, 0, 780, 1_000);
    expect(fiftyMinute.trueWidthPx).toBeCloseTo(2 / 3, 6);
    expect(thirteenMinute.trueWidthPx).toBeCloseTo((2 / 780) * 1_000, 9);
    expect(fiftyMinute.hitboxWidthPx).toBe(16);
    expect(thirteenMinute.hitboxWidthPx).toBe(16);
    expect(fiftyMinute.hitboxLeftPx).toBeGreaterThanOrEqual(0);
    expect(fiftyMinute.leftPx).toBeCloseTo(100 / 3, 6);
  });

  it("renders a forty-five-second true bar larger than a two-second bar", () => {
    const short = getTimelinePixelGeometry(100, 102, 0, 3_000, 1_000);
    const long = getTimelinePixelGeometry(100, 145, 0, 3_000, 1_000);
    expect(long.trueWidthPx).toBeGreaterThan(short.trueWidthPx * 20);
    expect(short.hitboxWidthPx).toBe(16);
  });

  it("distinguishes 2, 10, 45, and 60 seconds in selected detail ranges", () => {
    const widths = [2, 10, 45, 60].map((eventDuration) => {
      const range = getSelectedDetailRange(100, 100 + eventDuration, 3_000);
      return getTimelinePixelGeometry(
        100,
        100 + eventDuration,
        range.visibleStart,
        range.visibleEnd,
        900,
      ).trueWidthPx;
    });
    expect(widths[0]).toBeLessThan(widths[1]);
    expect(widths[1]).toBeLessThan(widths[2]);
    expect(widths[2]).toBeLessThan(widths[3]);
  });

  it("round-trips time and pixels in one coordinate system", () => {
    const pixel = timeToPixel(1_234.567, 900, 1_500, 1_200);
    expect(pixelToTime(pixel, 900, 1_500, 1_200)).toBeCloseTo(1_234.567, 9);
  });
});

describe("shared event boundary normalization", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      value: MouseEvent,
    });
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(cleanup);

  it("clamps the first event right edge at exactly sixty seconds", () => {
    const firstEvent = {
      ...originalEvent,
      start: 0,
      end: 15,
      detectedStart: 0,
      detectedEnd: 15,
    };
    const onBounds = vi.fn();
    render(
      <EventTimeline
        events={[firstEvent]}
        selectedId={firstEvent.id}
        current={0}
        duration={3_000}
        onSelect={noop}
        onSeek={noop}
        onBounds={onBounds}
        onReset={noop}
      />,
    );
    const track = screen.getByTestId("event-timeline-track");
    mockTrackRect(track);
    fireEvent.pointerDown(screen.getByRole("slider", { name: "Adjust Scrum end" }), {
      clientX: 5,
      pointerId: 10,
    });
    fireEvent.pointerMove(track, { clientX: 1_000, pointerId: 10 });
    const block = screen.getByTestId(`event-block-${firstEvent.id}`);
    expect(block.dataset.eventStart).toBe("0");
    expect(block.dataset.eventEnd).toBe("60");
    fireEvent.pointerUp(track, { clientX: 1_000, pointerId: 10 });
    expect(onBounds).toHaveBeenCalledOnce();
    expect(onBounds).toHaveBeenCalledWith(firstEvent.id, 0, 60);
  });

  it("clamps the first event left edge to a sixty-second interval", () => {
    expect(normalizeEventBoundaries({
      kind: "resize-start",
      start: 100,
      end: 150,
      pointerTime: 0,
      videoDuration: 3_000,
    })).toEqual({ start: 90, end: 150 });
  });

  it("uses the same clamp for later events and preserves move duration", () => {
    expect(normalizeEventBoundaries({
      kind: "resize-end",
      start: 1_200,
      end: 1_215,
      pointerTime: 2_000,
      videoDuration: 3_000,
    })).toEqual({ start: 1_200, end: 1_260 });
    expect(normalizeEventBoundaries({
      kind: "move",
      start: 1_200,
      end: 1_245,
      targetStart: 2_980,
      videoDuration: 3_000,
    })).toEqual({ start: 2_955, end: 3_000 });
  });

  it("normalizes floating-point intervals without exceeding sixty seconds", () => {
    const normalized = normalizeEventBoundaries({
      kind: "resize-end",
      start: 42.726,
      end: 55,
      pointerTime: 200,
      videoDuration: 3_000,
    });
    expect(normalized).toEqual({ start: 42.726, end: 102.726 });
    expect(normalized.end - normalized.start).toBeLessThanOrEqual(60);
  });
});

describe("boundary persistence synchronization", () => {
  it("renders optimistic geometry before persistence and keeps the successful response", async () => {
    let rendered = originalEvent;
    let resolvePersisted!: (event: VideoEvent) => void;
    const pending = new Promise<VideoEvent>((resolve) => { resolvePersisted = resolve; });
    const persistence = persistEventBoundaries({
      original: originalEvent,
      start: 20,
      end: 65,
      videoDuration: 100,
      updateLocal: (_id, start, end) => { rendered = { ...rendered, start, end }; },
      replaceLocal: (event) => { rendered = event; },
      persist: () => pending,
    });

    expect(getTimelineGeometry(rendered.start, rendered.end, 0, 100).widthPercent).toBe(45);
    const persisted = { ...originalEvent, end: 65, adjusted: true };
    resolvePersisted(persisted);
    await persistence;
    expect(rendered).toEqual(persisted);
  });

  it("restores persisted text and geometry when persistence fails", async () => {
    let rendered = originalEvent;
    const persistence = persistEventBoundaries({
      original: originalEvent,
      start: 20,
      end: 65,
      videoDuration: 100,
      updateLocal: (_id, start, end) => { rendered = { ...rendered, start, end }; },
      replaceLocal: (event) => { rendered = event; },
      persist: async () => { throw new Error("PATCH failed"); },
    });

    expect(rendered.end).toBe(65);
    await expect(persistence).rejects.toThrow("PATCH failed");
    expect(rendered).toEqual(originalEvent);
    expect(getTimelineGeometry(rendered.start, rendered.end, 0, 100).widthPercent).toBe(15);
  });

  it("never sends a PATCH interval above sixty seconds", async () => {
    const persist = vi.fn().mockImplementation(async (_id, start, end) => ({
      ...originalEvent,
      start,
      end,
    }));
    await persistEventBoundaries({
      original: { ...originalEvent, start: 42.726, end: 55 },
      start: 42.726,
      end: 500,
      videoDuration: 3_000,
      updateLocal: noop,
      replaceLocal: noop,
      persist,
    });
    const [, submittedStart, submittedEnd] = persist.mock.calls[0];
    expect(submittedEnd - submittedStart).toBeLessThanOrEqual(60);
    expect([submittedStart, submittedEnd]).toEqual([42.726, 102.726]);
  });

  it("does not let the hitbox minimum change submitted two-second boundaries", async () => {
    const persist = vi.fn().mockImplementation(async (_id, start, end) => ({
      ...originalEvent,
      start,
      end,
    }));
    const geometry = getTimelinePixelGeometry(100, 102, 0, 3_000, 1_000);
    expect(geometry.hitboxWidthPx).toBe(16);
    await persistEventBoundaries({
      original: { ...originalEvent, start: 100, end: 102 },
      start: 100,
      end: 102,
      videoDuration: 3_000,
      updateLocal: noop,
      replaceLocal: noop,
      persist,
    });
    expect(persist.mock.calls[0].slice(1)).toEqual([100, 102]);
  });

  it("turns a backend 422 into an inline message without raw Pydantic detail", () => {
    render(<TimelineHarness />);
    const message = getBoundaryPersistenceErrorMessage(
      new Error("422 Value error, Event duration cannot exceed 60 seconds"),
    );
    expect(message).toBe("Event boundaries must stay between 2 and 60 seconds. Previous values were restored.");
    expect(message).not.toContain("Value error");
    expect(screen.getByLabelText("Interactive event timeline")).toBeTruthy();
  });
});
