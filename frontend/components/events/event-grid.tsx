"use client";

import { Crosshair, Filter, MoreVertical, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import type { VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";

const descriptions: Record<string, string> = {
  Scrum: "Set-piece engagement and possession contest.",
  Lineout: "Restart sequence from the touchline corridor.",
  Maul: "Bound group advancing with the ball carrier.",
  "Goal Kick": "Place-kick attempt directed at the posts.",
};

export function EventGrid({
  events,
  selectedId,
  onSelect,
}: {
  events: VideoEvent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState("All Events");
  const filtered = useMemo(() => {
    if (tab === "High Confidence") return events.filter((event) => (event.confidence ?? 0) >= 0.9);
    if (tab === "Adjusted") return events.filter((event) => event.start !== event.detectedStart || event.end !== event.detectedEnd);
    if (tab === "Selected Type") {
      const label = events.find((event) => event.id === selectedId)?.label;
      return events.filter((event) => event.label === label);
    }
    return events;
  }, [events, selectedId, tab]);

  return (
    <section className="event-section">
      <div className="event-tabs">
        <div>{["All Events", "Selected Type", "High Confidence", "Adjusted"].map((item) => <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>)}</div>
        <div className="round-actions">
          <button aria-label="Search event cards"><Search size={16} /></button>
          <button aria-label="Filter event cards"><Filter size={16} /></button>
          <button aria-label="More event options"><MoreVertical size={16} /></button>
        </div>
      </div>
      <div className="event-grid">
        {filtered.map((event) => {
          const adjusted = event.start !== event.detectedStart || event.end !== event.detectedEnd;
          return (
            <button className={`event-card ${event.id === selectedId ? "selected" : ""}`} key={event.id} onClick={() => onSelect(event.id)}>
              <div className="event-card-top">
                <span className={`event-symbol ${event.label.toLowerCase().replace(" ", "-")}`}><Crosshair size={16} /></span>
                <span className="confidence">{Math.round((event.confidence ?? 0) * 100)}% confidence</span>
              </div>
              <h3>{event.label}</h3>
              <p>{descriptions[event.label]}</p>
              <footer>
                <span>{formatTime(event.start)} → {formatTime(event.end)}</span>
                <span>{Math.round(event.end - event.start)} sec</span>
                {adjusted && <span className="adjusted"><SlidersHorizontal size={12} /> Adjusted</span>}
              </footer>
            </button>
          );
        })}
      </div>
    </section>
  );
}
