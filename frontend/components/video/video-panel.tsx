"use client";

import { RotateCcw } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import type { VideoAsset, VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";
import type { EventDetectionStatus } from "@/stores/workspace-store";
import { VideoPlayer } from "./video-player";
import type { VideoPlayerHandle } from "./video-player";

export interface VideoPanelHandle {
  seekTo: (seconds: number) => void;
}

interface VideoPanelProps {
  current: number;
  onTime: (time: number) => void;
  onDuration: (duration: number) => void;
  selected?: VideoEvent;
  previewSignal: number;
  video?: VideoAsset | null;
  detectionStatus: EventDetectionStatus;
}

export const VideoPanel = forwardRef<VideoPanelHandle, VideoPanelProps>(function VideoPanel({
  onTime,
  onDuration,
  selected,
  previewSignal,
  video,
}, forwardedRef) {
  const playerRef = useRef<VideoPlayerHandle>(null);
  const selectedRef = useRef(selected);
  const source = video?.url ?? "/demo/match.mp4";
  selectedRef.current = selected;

  const seekTo = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
  }, []);

  useImperativeHandle(forwardedRef, () => ({ seekTo }), [seekTo]);

  useEffect(() => {
    const event = selectedRef.current;
    if (!event || previewSignal === 0) return;
    seekTo(event.start);
  }, [previewSignal, seekTo]);

  return (
    <section className="video-card" aria-label={video ? `Uploaded match video: ${video.name}` : "Demo match video"}>
      <div className="match-strip">
        <div><span className="live-dot" /> {video ? "Uploaded match" : "Demo match"}</div>
        {video
          ? <strong>{video.name}</strong>
          : <strong>Stade Toulousain <b>17</b> <span>—</span> <b>10</b> ASM Clermont</strong>}
        <div><span>{video ? "Ready to review" : "First half"}</span><strong>{formatTime(video?.duration ?? 300)}</strong></div>
      </div>
      <VideoPlayer
        ref={playerRef}
        src={source}
        duration={video?.duration ?? undefined}
        title={video ? `Uploaded video ${video.name}` : "Toulouse versus ASM demo match"}
        variant="match"
        onTimeChange={onTime}
        onDurationChange={onDuration}
        fallback={(
          <div className="video-missing">
            <span className="missing-kicker">{video ? "Video unavailable" : "Demo video placeholder"}</span>
            <strong>{video ? "The uploaded match could not be loaded" : "Add match.mp4 to begin video review"}</strong>
            <p>{video ? "Check that the backend is running and try the upload again." : "Event detection data and all timeline tools remain available."}</p>
          </div>
        )}
      >
        <div className="pitch-visual" aria-hidden="true">
          <div className="pitch-midline" />
          <div className="pitch-circle" />
          <div className="post left-post" />
          <div className="post right-post" />
          <div className="rugby-ball-large"><span /></div>
        </div>
        {selected && (
          <div className="fullscreen-event-context">
            <span>Selected event</span>
            <strong>{selected.label}</strong>
            <span>{formatTime(selected.start, true)} – {formatTime(selected.end, true)}</span>
            <span>{Math.round((selected.confidence ?? 0) * 100)}% confidence</span>
          </div>
        )}
      </VideoPlayer>
      <div className="video-footer">
        <span>{video ? "Uploaded source · backend stream" : "Broadcast feed · 1080p"}</span>
        <button type="button" onClick={() => seekTo(0)}><RotateCcw size={13} /> Restart</button>
      </div>
    </section>
  );
});

VideoPanel.displayName = "VideoPanel";
