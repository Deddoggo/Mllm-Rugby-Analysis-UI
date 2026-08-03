// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { EventTimeline } from "@/components/timeline/event-timeline";
import type { VideoEvent } from "@/lib/domain";
import { render } from "./render";

const event: VideoEvent = {
  id: "event_001",
  videoId: "match_20260803_abcd1234",
  label: "Scrum",
  start: 20,
  end: 35,
  confidence: 0.92,
  detectedStart: 20,
  detectedEnd: 35,
  adjusted: false,
};

const noop = () => undefined;

function rect(left: number, width: number, height = 60): DOMRect {
  return {
    bottom: height,
    height,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

describe("compact Chakra scroll areas", () => {
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

  it("centralizes xs hover configuration and renders both timeline scrollbars", () => {
    render(<AppScrollArea orientation="both" testId="both-scroll"><div>content</div></AppScrollArea>);
    const root = screen.getByTestId("both-scroll");
    expect(root.dataset.scrollSize).toBe("xs");
    expect(root.dataset.scrollVariant).toBe("hover");
    const scrollbars = root.querySelectorAll('[data-part="scrollbar"]');
    expect(scrollbars).toHaveLength(2);
    expect([...scrollbars].map((item) => item.getAttribute("data-orientation")).sort()).toEqual([
      "horizontal",
      "vertical",
    ]);
    expect(root.querySelector('[data-part="corner"]')).toBeTruthy();
  });

  it("does not render a horizontal scrollbar for a vertical-only area", () => {
    render(<AppScrollArea testId="vertical-scroll"><div>content</div></AppScrollArea>);
    const root = screen.getByTestId("vertical-scroll");
    expect(root.querySelectorAll('[data-part="scrollbar"]')).toHaveLength(1);
    expect(root.querySelector('[data-orientation="horizontal"]')).toBeNull();
  });

  it("includes viewport scrollLeft in click and resize timestamps", () => {
    const onSeek = vi.fn();
    const onBounds = vi.fn();
    render(
      <EventTimeline
        events={[event]}
        selectedId={event.id}
        current={0}
        duration={100}
        onSelect={noop}
        onSeek={onSeek}
        onBounds={onBounds}
        onReset={noop}
      />,
    );
    const track = screen.getByTestId("event-timeline-track");
    const viewport = document.querySelector(".timeline-scroll-viewport") as HTMLDivElement;
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue(rect(50, 200));
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(rect(100, 100));
    Object.defineProperty(track, "offsetLeft", { configurable: true, value: 10 });
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 50, writable: true });

    fireEvent.click(track, { clientX: 150 });
    expect(onSeek).toHaveBeenCalledWith(45);

    fireEvent.pointerDown(screen.getByRole("slider", { name: "Adjust Scrum end" }), {
      clientX: 130,
      pointerId: 1,
    });
    fireEvent.pointerMove(track, { clientX: 150, pointerId: 1 });
    expect(screen.getByTestId(`event-block-${event.id}`).dataset.eventEnd).toBe("45");
    expect(onBounds).not.toHaveBeenCalled();
    fireEvent.pointerUp(track, { clientX: 150, pointerId: 1 });
    expect(onBounds).toHaveBeenCalledOnce();
    expect(onBounds).toHaveBeenCalledWith(event.id, 20, 45);
  });
});
