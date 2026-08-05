"use client";

import { Bell, ChevronRight, Command, Home, Search, Settings } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";

export function AppTopbar({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (value: string) => void;
}) {
  const apiMode = (process.env.NEXT_PUBLIC_DATA_MODE ?? "api") === "api";
  const currentVideo = useWorkspaceStore((state) => state.currentVideo);
  const detectionStatus = useWorkspaceStore((state) => state.eventDetectionStatus);
  const eventStatus = !currentVideo
    ? "Awaiting upload"
    : detectionStatus === "detecting"
      ? "Detecting events"
      : detectionStatus === "ready"
        ? "Event data loaded"
        : detectionStatus === "error"
          ? "Detection unavailable"
          : "Video ready";

  return (
    <header className="topbar">
      <div className="breadcrumb">
        <Home size={14} />
        <span>Home</span>
        <ChevronRight size={13} />
        <strong>Analysis Workspace</strong>
      </div>
      <div className="top-actions">
        <label className="search-field">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search events..."
            aria-label="Search events"
          />
          <span><Command size={12} /> K</span>
        </label>
        <span className="status-pill demo">{apiMode ? "API mode" : "Demo mode"}</span>
        <span className="status-pill loaded"><i /> {eventStatus}</span>
        <span className="status-pill offline"><i /> {apiMode ? "AI service" : "AI offline"}</span>
        <button className="icon-button" aria-label="Notifications"><Bell size={17} /></button>
        <button className="icon-button hide-tablet" aria-label="Settings"><Settings size={17} /></button>
        <span className="avatar" aria-label="Analyst profile">AT</span>
      </div>
    </header>
  );
}
