"use client";

import { Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { EventLabel, VideoEvent } from "@/lib/domain";
import { formatTime, validateBounds } from "@/lib/time";

const eventTone: Record<EventLabel, string> = {
  Scrum: "scrum",
  Lineout: "lineout",
  Maul: "maul",
  "Goal Kick": "kick",
  Background: "background",
};

const ticks = [0, 60, 120, 180, 240, 300];

type DragState = {
  id: string;
  kind: "move" | "start" | "end";
  originX: number;
  start: number;
  end: number;
} | null;

export function EventTimeline({
  events,
  selectedId,
  current,
  onSelect,
  onSeek,
  onBounds,
  onReset,
}: {
  events: VideoEvent[];
  selectedId: string | null;
  current: number;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onBounds: (id: string, start: number, end: number) => void;
  onReset: (id: string) => void;
}) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState>(null);
  const [draft, setDraft] = useState<{ id: string; start: number; end: number } | null>(null);
  const duration = 300;

  const visibleEvents = useMemo(
    () => events.map((event) => draft?.id === event.id ? { ...event, ...draft } : event),
    [events, draft],
  );

  const secondsFromPointer = (clientX: number) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return ((clientX - rect.left) / rect.width) * duration;
  };

  const beginDrag = (
    event: React.PointerEvent,
    item: VideoEvent,
    kind: NonNullable<DragState>["kind"],
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(item.id);
    setDrag({ id: item.id, kind, originX: event.clientX, start: item.start, end: item.end });
    setDraft({ id: item.id, start: item.start, end: item.end });
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag || !timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const delta = ((event.clientX - drag.originX) / rect.width) * duration;
    let start = drag.start;
    let end = drag.end;
    if (drag.kind === "move") {
      const length = end - start;
      start = Math.max(0, Math.min(duration - length, start + delta));
      end = start + length;
    } else if (drag.kind === "start") {
      start = Math.max(0, Math.min(end - 2, start + delta));
    } else {
      end = Math.min(duration, Math.max(start + 2, end + delta));
    }
    const bounded = validateBounds(start, end, duration);
    setDraft({ id: drag.id, ...bounded });
  };

  const finishDrag = () => {
    if (draft) onBounds(draft.id, draft.start, draft.end);
    setDrag(null);
    setDraft(null);
  };

  return (
    <section className="timeline-panel" aria-label="Interactive event timeline">
      <div className="timeline-heading">
        <div>
          <span className="eyebrow">Detected event proposals</span>
          <h2>Match timeline</h2>
        </div>
        <div className="timeline-tools">
          <span>{formatTime(current, true)} / 05:00</span>
          <button onClick={() => setZoom(Math.max(1, zoom - 0.25))} aria-label="Zoom out"><Minus size={14} /></button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.25))} aria-label="Zoom in"><Plus size={14} /></button>
          <button aria-label="Timeline settings"><SlidersHorizontal size={14} /></button>
        </div>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-canvas" style={{ width: `${zoom * 100}%` }}>
          <div className="timeline-ruler">
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / duration) * 100}%` }}>{formatTime(tick)}</span>)}
          </div>
          <div
            className="timeline-track"
            ref={timelineRef}
            onClick={(event) => onSeek(secondsFromPointer(event.clientX))}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          >
            <div className="playhead" style={{ left: `${(current / duration) * 100}%` }}><span /></div>
            {visibleEvents.map((item) => (
              <button
                key={item.id}
                className={`event-block ${eventTone[item.label]} ${selectedId === item.id ? "selected" : ""}`}
                style={{
                  left: `${(item.start / duration) * 100}%`,
                  width: `${((item.end - item.start) / duration) * 100}%`,
                }}
                onPointerDown={(event) => beginDrag(event, item, "move")}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    event.preventDefault();
                    const delta = event.key === "ArrowLeft" ? -0.5 : 0.5;
                    const length = item.end - item.start;
                    const start = Math.max(0, Math.min(duration - length, item.start + delta));
                    onBounds(item.id, start, start + length);
                  }
                }}
                title={`${item.label} · ${Math.round((item.confidence ?? 0) * 100)}% confidence`}
              >
                <span
                  className="boundary left"
                  role="slider"
                  aria-label={`Adjust ${item.label} start`}
                  aria-valuenow={item.start}
                  onPointerDown={(event) => beginDrag(event, item, "start")}
                />
                <strong>{item.label}</strong>
                <small>{Math.round((item.confidence ?? 0) * 100)}%</small>
                <span
                  className="boundary right"
                  role="slider"
                  aria-label={`Adjust ${item.label} end`}
                  aria-valuenow={item.end}
                  onPointerDown={(event) => beginDrag(event, item, "end")}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="timeline-legend">
        {Object.entries(eventTone).slice(0, 4).map(([label, tone]) => <span key={label}><i className={tone} />{label}</span>)}
        <button disabled={!selectedId} onClick={() => selectedId && onReset(selectedId)}><RotateCcw size={13} /> Reset selected</button>
      </div>
    </section>
  );
}
