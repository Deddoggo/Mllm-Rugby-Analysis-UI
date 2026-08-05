"use client";

import { X } from "lucide-react";
import type { TemporaryClipPreview, VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";
import { VideoPlayer } from "@/components/video/video-player";

export type ClipPreviewStatus = "idle" | "loading" | "ready" | "error";

export function ClipPreview({
  event,
  clip,
  status,
  error,
  onClose,
  onRetry,
}: {
  event: VideoEvent;
  clip: TemporaryClipPreview | null;
  status: ClipPreviewStatus;
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
      {status === "loading" && <div className="clip-preview-state"><span className="spinner" /> Preparing temporary preview…</div>}
      {status === "error" && <div className="clip-preview-state error">{error}<button onClick={onRetry}>Retry</button></div>}
      {status === "ready" && clip && (
        <>
          <VideoPlayer
            src={clip.streamUrl}
            duration={clip.duration}
            title={`${event.label} temporary clip preview`}
            variant="preview"
          />
          <footer>
            <span>{clip.duration.toFixed(1)}s · temporary preview</span>
            <span>Not saved to analysis cache</span>
            <span>Preview only · no VLM request</span>
          </footer>
        </>
      )}
    </section>
  );
}
