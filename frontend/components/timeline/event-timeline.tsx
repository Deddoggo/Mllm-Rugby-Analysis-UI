"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Minus, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { EventLabel, VideoEvent } from "@/lib/domain";
import {
  formatTime,
  normalizeEventBoundaries,
} from "@/lib/time";
import {
  getSelectedDetailRange,
  getTimelineGeometry,
  pixelToTime,
} from "@/lib/timeline-geometry";

const eventTone: Record<EventLabel, string> = {
  Scrum: "scrum",
  Lineout: "lineout",
  Maul: "maul",
  "Goal Kick": "kick",
  Background: "background",
};

type DragKind = "move" | "start" | "end";
type TimelineSurface = "overview" | "detail";

type DragState = {
  id: string;
  kind: DragKind;
  surface: TimelineSurface;
  originPointerTime: number;
  start: number;
  end: number;
  visibleStart: number;
  visibleEnd: number;
} | null;

export function EventTimeline({
  events,
  selectedId,
  current,
  duration,
  onSelect,
  onSeek,
  onBounds,
  onReset,
}: {
  events: VideoEvent[];
  selectedId: string | null;
  current: number;
  duration: number;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onBounds: (id: string, start: number, end: number) => void;
  onReset: (id: string) => void;
}) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const overviewViewportRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<DragState>(null);
  const [draft, setDraft] = useState<{ id: string; start: number; end: number } | null>(null);
  const safeDuration = Math.max(1, duration);
  const ticks = useMemo(
    () => Array.from({ length: 6 }, (_, index) => (safeDuration * index) / 5),
    [safeDuration],
  );
  const effectiveEvents = useMemo(
    () => events.map((event) => draft?.id === event.id ? { ...event, ...draft } : event),
    [events, draft],
  );
  const selectedPersisted = events.find((event) => event.id === selectedId);
  const selectedEffective = effectiveEvents.find((event) => event.id === selectedId);
  const detailRange = selectedPersisted
    ? getSelectedDetailRange(selectedPersisted.start, selectedPersisted.end, safeDuration)
    : null;

  const pointerTime = (
    clientX: number,
    ref: RefObject<HTMLDivElement | null>,
    visibleStart: number,
    visibleEnd: number,
    viewportRef?: RefObject<HTMLDivElement | null>,
  ) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return visibleStart;
    const viewport = viewportRef?.current;
    const pixel = viewport
      ? clientX - viewport.getBoundingClientRect().left + viewport.scrollLeft - ref.current.offsetLeft
      : clientX - rect.left;
    const boundedPixel = Math.min(rect.width, Math.max(0, pixel));
    return pixelToTime(boundedPixel, visibleStart, visibleEnd, rect.width);
  };

  const beginDrag = (
    event: ReactPointerEvent,
    item: VideoEvent,
    kind: DragKind,
    surface: TimelineSurface,
    ref: RefObject<HTMLDivElement | null>,
    visibleStart: number,
    visibleEnd: number,
    viewportRef?: RefObject<HTMLDivElement | null>,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const normalized = normalizeEventBoundaries({
      kind: "normalize",
      start: item.start,
      end: item.end,
      videoDuration: safeDuration,
    });
    if (kind === "move") onSelect(item.id);
    setDrag({
      id: item.id,
      kind,
      surface,
      originPointerTime: pointerTime(event.clientX, ref, visibleStart, visibleEnd, viewportRef),
      start: normalized.start,
      end: normalized.end,
      visibleStart,
      visibleEnd,
    });
    setDraft({ id: item.id, ...normalized });
  };

  const moveDrag = (
    event: ReactPointerEvent,
    surface: TimelineSurface,
    ref: RefObject<HTMLDivElement | null>,
    viewportRef?: RefObject<HTMLDivElement | null>,
  ) => {
    if (!drag || drag.surface !== surface) return;
    const nextPointerTime = pointerTime(
      event.clientX,
      ref,
      drag.visibleStart,
      drag.visibleEnd,
      viewportRef,
    );
    const kind = drag.kind === "start"
      ? "resize-start"
      : drag.kind === "end"
        ? "resize-end"
        : "move";
    const normalized = normalizeEventBoundaries({
      kind,
      start: drag.start,
      end: drag.end,
      videoDuration: safeDuration,
      pointerTime: nextPointerTime,
      targetStart: drag.start + (nextPointerTime - drag.originPointerTime),
    });
    setDraft({ id: drag.id, ...normalized });
  };

  const finishDrag = () => {
    if (draft && drag) {
      const committed = normalizeEventBoundaries({
        kind: "normalize",
        start: draft.start,
        end: draft.end,
        videoDuration: safeDuration,
      });
      if (committed.start !== drag.start || committed.end !== drag.end) {
        onBounds(draft.id, committed.start, committed.end);
      }
    }
    setDrag(null);
    setDraft(null);
  };

  const cancelDrag = () => {
    setDrag(null);
    setDraft(null);
  };

  const renderEvents = (
    items: VideoEvent[],
    surface: TimelineSurface,
    ref: RefObject<HTMLDivElement | null>,
    visibleStart: number,
    visibleEnd: number,
    viewportRef?: RefObject<HTMLDivElement | null>,
  ) => items.map((item) => {
    const geometry = getTimelineGeometry(item.start, item.end, visibleStart, visibleEnd);
    const selected = selectedId === item.id;
    const testPrefix = surface === "overview" ? "event" : "event-detail";
    const hitboxStyle = {
      left: `clamp(0px, calc(${geometry.leftPercent + geometry.widthPercent / 2}% - max(${geometry.widthPercent / 2}%, 8px)), calc(100% - max(${geometry.widthPercent}%, 16px)))`,
      width: `max(${geometry.widthPercent}%, 16px)`,
    } satisfies CSSProperties;

    return (
      <Fragment key={`${surface}-${item.id}`}>
        <div
          data-testid={`${testPrefix}-block-${item.id}`}
          data-event-start={item.start}
          data-event-end={item.end}
          className={`event-block ${eventTone[item.label]} ${selected ? "selected" : ""}`}
          style={{
            left: `${geometry.leftPercent}%`,
            width: `${geometry.widthPercent}%`,
          }}
        />
        <button
          data-testid={`${testPrefix}-hitbox-${item.id}`}
          className={`event-hitbox ${selected ? "selected" : ""}`}
          style={hitboxStyle}
          onPointerDown={(event) => beginDrag(
            event,
            item,
            "move",
            surface,
            ref,
            visibleStart,
            visibleEnd,
            viewportRef,
          )}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) onSelect(item.id);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              const targetStart = item.start + (event.key === "ArrowLeft" ? -0.5 : 0.5);
              const moved = normalizeEventBoundaries({
                kind: "move",
                start: item.start,
                end: item.end,
                targetStart,
                videoDuration: safeDuration,
              });
              onBounds(item.id, moved.start, moved.end);
            }
          }}
          aria-label={`${item.label} event${surface === "detail" ? " in detail" : ""}`}
          title={`${item.label} · ${Math.round((item.confidence ?? 0) * 100)}% confidence`}
        >
          <strong>{item.label}</strong>
          <small>{Math.round((item.confidence ?? 0) * 100)}%</small>
        </button>
        <span
          className={`boundary left ${selected ? "selected" : ""}`}
          style={{ left: `${geometry.leftPercent}%` }}
          role="slider"
          aria-label={`Adjust ${item.label} start${surface === "detail" ? " in detail" : ""}`}
          aria-valuenow={item.start}
          onPointerDown={(event) => beginDrag(
            event,
            item,
            "start",
            surface,
            ref,
            visibleStart,
            visibleEnd,
            viewportRef,
          )}
        />
        <span
          className={`boundary right ${selected ? "selected" : ""}`}
          style={{ left: `${geometry.leftPercent + geometry.widthPercent}%` }}
          role="slider"
          aria-label={`Adjust ${item.label} end${surface === "detail" ? " in detail" : ""}`}
          aria-valuenow={item.end}
          onPointerDown={(event) => beginDrag(
            event,
            item,
            "end",
            surface,
            ref,
            visibleStart,
            visibleEnd,
            viewportRef,
          )}
        />
      </Fragment>
    );
  });

  return (
    <section className="timeline-panel" aria-label="Interactive event timeline">
      <div className="timeline-heading">
        <div>
          <span className="eyebrow">Detected event proposals</span>
          <h2>Match timeline</h2>
        </div>
        <div className="timeline-tools">
          <span>{formatTime(current, true)} / {formatTime(safeDuration)}</span>
          <button onClick={() => setZoom(Math.max(1, zoom - 0.25))} aria-label="Zoom out"><Minus size={14} /></button>
          <strong>{Math.round(zoom * 100)}%</strong>
          <button onClick={() => setZoom(Math.min(2, zoom + 0.25))} aria-label="Zoom in"><Plus size={14} /></button>
          <button aria-label="Timeline settings"><SlidersHorizontal size={14} /></button>
        </div>
      </div>
      <div className="timeline-scroll" ref={overviewViewportRef} data-testid="timeline-scroll-area">
        <div className="timeline-canvas" style={{ width: `${zoom * 100}%` }}>
          <div className="timeline-ruler">
            {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / safeDuration) * 100}%` }}>{formatTime(tick)}</span>)}
          </div>
          <div
            className="timeline-track"
            data-testid="event-timeline-track"
            ref={overviewRef}
            onClick={(event) => onSeek(pointerTime(
              event.clientX,
              overviewRef,
              0,
              safeDuration,
              overviewViewportRef,
            ))}
            onPointerMove={(event) => moveDrag(event, "overview", overviewRef, overviewViewportRef)}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          >
            <div className="playhead" style={{ left: `${(current / safeDuration) * 100}%` }}><span /></div>
            {renderEvents(
              effectiveEvents,
              "overview",
              overviewRef,
              0,
              safeDuration,
              overviewViewportRef,
            )}
          </div>
        </div>
      </div>

      {selectedEffective && detailRange && (
        <div className="event-detail-editor">
          <div className="event-detail-heading">
            <div><strong>Selected event detail</strong><span>15s context · full 60s edit range</span></div>
            <span>
              {formatTime(selectedEffective.start, true)} → {formatTime(selectedEffective.end, true)} · {(selectedEffective.end - selectedEffective.start).toFixed(3)}s
            </span>
          </div>
          <div className="event-detail-ruler">
            <span>{formatTime(detailRange.visibleStart, true)}</span>
            <span>{formatTime(detailRange.visibleEnd, true)}</span>
          </div>
          <div
            className="timeline-track event-detail-track"
            data-testid="event-detail-track"
            ref={detailRef}
            onClick={(event) => onSeek(pointerTime(
              event.clientX,
              detailRef,
              detailRange.visibleStart,
              detailRange.visibleEnd,
            ))}
            onPointerMove={(event) => moveDrag(event, "detail", detailRef)}
            onPointerUp={finishDrag}
            onPointerCancel={cancelDrag}
          >
            {renderEvents(
              [selectedEffective],
              "detail",
              detailRef,
              detailRange.visibleStart,
              detailRange.visibleEnd,
            )}
          </div>
        </div>
      )}

      <div className="timeline-legend">
        {Object.entries(eventTone).slice(0, 4).map(([label, tone]) => <span key={label}><i className={tone} />{label}</span>)}
        <button disabled={!selectedId} onClick={() => selectedId && onReset(selectedId)}><RotateCcw size={13} /> Reset selected</button>
      </div>
    </section>
  );
}
