// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoEvent } from "@/lib/domain";
import { seekMediaElement } from "@/lib/playback-sync";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { VideoPanel } from "@/components/video/video-panel";
import type { VideoPanelHandle } from "@/components/video/video-panel";

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

function SyncedHarness({
  events = [event],
  onSeekRequest = noop,
}: {
  events?: VideoEvent[];
  onSeekRequest?: (seconds: number) => void;
}) {
  const playerRef = useRef<VideoPanelHandle>(null);
  const [current, setCurrent] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = events.find((item) => item.id === selectedId);
  const seekTo = (seconds: number) => {
    onSeekRequest(seconds);
    playerRef.current?.seekTo(seconds);
  };
  const selectAndSeek = (id: string) => {
    const selectedEvent = events.find((item) => item.id === id);
    if (!selectedEvent) return;
    setSelectedId(id);
    seekTo(selectedEvent.start);
  };

  return (
    <>
      <VideoPanel
        ref={playerRef}
        current={current}
        onTime={setCurrent}
        onDuration={noop}
        selected={selected}
        previewSignal={0}
        video={null}
        detectionStatus="ready"
      />
      <EventTimeline
        events={events}
        selectedId={selectedId}
        current={current}
        duration={100}
        onSelect={selectAndSeek}
        onSeek={seekTo}
        onBounds={noop}
        onReset={noop}
      />
    </>
  );
}

describe("video and timeline synchronization", () => {
  let pauseSpy: ReturnType<typeof vi.spyOn>;
  let playSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pauseSpy = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(noop);
    playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    pauseSpy.mockRestore();
    playSpy.mockRestore();
  });

  it("timeline click invokes the player seek contract and visual time follows media events", () => {
    const requests = vi.fn();
    render(<SyncedHarness onSeekRequest={requests} />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    const track = screen.getByTestId("event-timeline-track");
    vi.spyOn(track, "getBoundingClientRect").mockReturnValue({
      bottom: 10,
      height: 10,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.click(track, { clientX: 50 });
    expect(requests).toHaveBeenCalledOnce();
    expect(requests).toHaveBeenCalledWith(50);
    expect(video.currentTime).toBe(50);

    fireEvent.seeking(video);
    expect(screen.getByText("00:50.0 / 01:40")).toBeTruthy();
  });

  it("explicit event selection seeks exactly once to event start", () => {
    const requests = vi.fn();
    render(<SyncedHarness onSeekRequest={requests} />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 100 });
    const eventButton = screen.getByTestId(`event-hitbox-${event.id}`) as HTMLButtonElement;

    fireEvent.pointerDown(eventButton, { clientX: 20, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("event-timeline-track"), { pointerId: 1 });
    fireEvent.click(eventButton, { detail: 1 });

    expect(requests).toHaveBeenCalledOnce();
    expect(requests).toHaveBeenCalledWith(event.start);
    expect(video.currentTime).toBe(event.start);
    expect(playSpy).not.toHaveBeenCalled();
  });

  it("playback-originated time updates change display without requesting a seek", () => {
    const requests = vi.fn();
    render(<SyncedHarness onSeekRequest={requests} />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    video.currentTime = 12.5;

    fireEvent.timeUpdate(video);

    expect(requests).not.toHaveBeenCalled();
    expect(screen.getByText("00:12.5 / 01:40")).toBeTruthy();
  });

  it("does not pause when playback crosses selected event boundaries", () => {
    render(<SyncedHarness />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    const eventButton = screen.getByTestId(`event-hitbox-${event.id}`) as HTMLButtonElement;
    fireEvent.pointerDown(eventButton, { clientX: 20, pointerId: 1 });
    pauseSpy.mockClear();
    video.currentTime = event.end + 1;

    fireEvent.timeUpdate(video);

    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it("keeps the same media element and source across event and clock rerenders", () => {
    const panelRef = createRef<VideoPanelHandle>();
    const baseProps = {
      current: 0,
      onTime: noop,
      onDuration: noop,
      previewSignal: 0,
      video: null,
      detectionStatus: "ready" as const,
    };
    const { rerender } = render(<VideoPanel ref={panelRef} {...baseProps} selected={event} />);
    const original = screen.getByTestId("match-video") as HTMLVideoElement;
    const originalSource = original.getAttribute("src");

    rerender(<VideoPanel ref={panelRef} {...baseProps} current={18} detectionStatus="detecting" selected={{ ...event, confidence: 0.95 }} />);
    const afterEventUpdate = screen.getByTestId("match-video");
    rerender(<VideoPanel ref={panelRef} {...baseProps} current={19} selected={{ ...event, start: 21 }} />);

    expect(screen.getByTestId("match-video")).toBe(original);
    expect(afterEventUpdate).toBe(original);
    expect(original.getAttribute("src")).toBe(originalSource);
  });

  it("event loading and PATCH-like selected object updates do not seek", () => {
    const panelRef = createRef<VideoPanelHandle>();
    const props = {
      current: 8,
      onTime: noop,
      onDuration: noop,
      previewSignal: 0,
      video: null,
      detectionStatus: "ready" as const,
    };
    const { rerender } = render(<VideoPanel ref={panelRef} {...props} />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    video.currentTime = 8;

    rerender(<VideoPanel ref={panelRef} {...props} selected={event} />);
    rerender(<VideoPanel ref={panelRef} {...props} selected={{ ...event, start: 24, adjusted: true }} />);

    expect(video.currentTime).toBe(8);
  });

  it("preview seeks only when the explicit preview signal changes", () => {
    const props = {
      current: 0,
      onTime: noop,
      onDuration: noop,
      video: null,
      detectionStatus: "ready" as const,
    };
    const { rerender } = render(<VideoPanel {...props} selected={event} previewSignal={1} />);
    const video = screen.getByTestId("match-video") as HTMLVideoElement;
    expect(video.currentTime).toBe(event.start);

    rerender(<VideoPanel {...props} selected={{ ...event, start: 25, adjusted: true }} previewSignal={1} />);
    expect(video.currentTime).toBe(event.start);

    rerender(<VideoPanel {...props} selected={{ ...event, start: 25, adjusted: true }} previewSignal={2} />);
    expect(video.currentTime).toBe(25);
  });
});

describe("seekMediaElement", () => {
  it("clamps one explicit write to the real media duration", () => {
    const media = { currentTime: 10, duration: 100 };
    expect(seekMediaElement(media, 120)).toBe(100);
    expect(media.currentTime).toBe(100);
  });
});
