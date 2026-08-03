"use client";

import { X } from "lucide-react";
import type { EventClip, VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";
import type { ClipStatus } from "@/stores/workspace-store";

export function ClipPreview({
  event,
  clip,
  status,
  error,
  onClose,
  onRetry,
}: {
  event: VideoEvent;
  clip: EventClip | null;
  status: ClipStatus;
  error: string | null;
  onClose: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="clip-preview" aria-label="Selected event clip preview">
      <header>
        <div>
          <span>Selected clip</span>
          <strong>{event.label} · {formatTime(event.start, true)} → {formatTime(event.end, true)}</strong>
        </div>
        <button onClick={onClose} aria-label="Close clip preview"><X size={15} /></button>
      </header>
      {status === "extracting" && <div className="clip-preview-state"><span className="spinner" /> Preparing selected clip…</div>}
      {status === "error" && <div className="clip-preview-state error">{error}<button onClick={onRetry}>Retry</button></div>}
      {status === "ready" && clip && (
        <>
          <video controls preload="metadata" src={clip.streamUrl} data-testid="clip-preview-video" />
          <footer>
            <span>{clip.duration.toFixed(1)}s · {clip.extractionProfile}</span>
            <span>{clip.cached ? "Cached clip reused" : "New clip extracted"}</span>
            <span>AI Offline · analysis remains mocked</span>
          </footer>
        </>
      )}
    </section>
  );
}
