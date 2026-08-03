"use client";

import {
  Expand,
  Gauge,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { VideoAsset, VideoEvent } from "@/lib/domain";
import { seekMediaElement } from "@/lib/playback-sync";
import { formatTime } from "@/lib/time";
import type { EventDetectionStatus } from "@/stores/workspace-store";

const MEDIA_DEBUG = process.env.NEXT_PUBLIC_MEDIA_DEBUG === "true";

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
  current,
  onTime,
  onDuration,
  selected,
  previewSignal,
  video,
  detectionStatus,
}, forwardedRef) {
  const playerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedRef = useRef(selected);
  const detectionStatusRef = useRef(detectionStatus);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [duration, setDuration] = useState(video?.duration ?? 300);
  const source = video?.url ?? "/demo/match.mp4";
  selectedRef.current = selected;
  detectionStatusRef.current = detectionStatus;

  const seekTo = useCallback((seconds: number, reason = "imperative") => {
    const element = videoRef.current;
    if (!element) return;
    const target = seekMediaElement(element, seconds);
    if (MEDIA_DEBUG) {
      console.info("[media-debug] programmatic seek", {
        reason,
        requested: seconds,
        target,
        source: element.currentSrc || source,
      });
    }
  }, [source]);

  useImperativeHandle(forwardedRef, () => ({
    seekTo: (seconds: number) => seekTo(seconds, "external request"),
  }), [seekTo]);

  const toggle = useCallback(async () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      await element.play();
    } else {
      if (MEDIA_DEBUG) {
        console.info("[media-debug] explicit pause", {
          reason: "playback control",
          currentTime: element.currentTime,
          source: element.currentSrc || source,
        });
      }
      element.pause();
    }
  }, [source]);

  useEffect(() => {
    if (!MEDIA_DEBUG) return;
    console.info("[media-debug] component mount");
    return () => console.info("[media-debug] component unmount");
  }, []);

  useEffect(() => {
    const element = videoRef.current;
    if (!element || !MEDIA_DEBUG) return;
    const eventNames = [
      "play",
      "pause",
      "seeking",
      "seeked",
      "timeupdate",
      "ended",
      "waiting",
      "stalled",
      "suspend",
      "emptied",
      "loadedmetadata",
    ];
    let lastTimeUpdateLog = -Infinity;
    const report = (event: Event) => {
      if (event.type === "timeupdate" && element.currentTime - lastTimeUpdateLog < 1) return;
      if (event.type === "timeupdate") lastTimeUpdateLog = element.currentTime;
      console.info("[media-debug]", event.type, {
        currentTime: element.currentTime,
        paused: element.paused,
        ended: element.ended,
        readyState: element.readyState,
        networkState: element.networkState,
        selectedEventId: selectedRef.current?.id ?? null,
        detectionStatus: detectionStatusRef.current,
        source: element.currentSrc || source,
      });
    };
    console.info("[media-debug] source assigned", { source });
    eventNames.forEach((eventName) => element.addEventListener(eventName, report));
    return () => eventNames.forEach((eventName) => element.removeEventListener(eventName, report));
  }, [source]);

  useEffect(() => {
    const event = selectedRef.current;
    if (!event || previewSignal === 0) return;
    seekTo(event.start, "preview selected event");
    void videoRef.current?.play();
  }, [previewSignal, seekTo]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const element = videoRef.current;
      if (!element) return;
      if (event.code === "Space") {
        event.preventDefault();
        void toggle();
      }
      if (event.key === "ArrowLeft") seekTo(element.currentTime - 5, "keyboard -5 seconds");
      if (event.key === "ArrowRight") seekTo(element.currentTime + 5, "keyboard +5 seconds");
      if (event.key.toLowerCase() === "j") seekTo(element.currentTime - 10, "keyboard -10 seconds");
      if (event.key.toLowerCase() === "l") seekTo(element.currentTime + 10, "keyboard +10 seconds");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [seekTo, toggle]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    setMissing(false);
    const configuredDuration = video?.duration;
    if (configuredDuration && Number.isFinite(configuredDuration)) {
      setDuration(configuredDuration);
      onDuration(configuredDuration);
    }
  }, [onDuration, video?.duration, video?.id]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
    else await playerRef.current?.requestFullscreen();
  };

  return (
    <section ref={playerRef} className="video-card" aria-label={video ? `Uploaded match video: ${video.name}` : "Demo match video"}>
      <div className="match-strip">
        <div><span className="live-dot" /> {video ? "Uploaded match" : "Demo match"}</div>
        {video
          ? <strong>{video.name}</strong>
          : <strong>Stade Toulousain <b>17</b> <span>—</span> <b>10</b> ASM Clermont</strong>}
        <div><span>{video ? "Ready to review" : "First half"}</span><strong>{formatTime(duration)}</strong></div>
      </div>
      <div className="video-stage">
        <video
          ref={videoRef}
          data-testid="match-video"
          src={source}
          muted={muted}
          onLoadStart={() => onTime(0)}
          onError={() => setMissing(true)}
          onLoadedMetadata={(event) => {
            const actualDuration = event.currentTarget.duration;
            if (Number.isFinite(actualDuration)) {
              setDuration(actualDuration);
              onDuration(actualDuration);
            }
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onSeeking={(event) => onTime(event.currentTarget.currentTime)}
          onSeeked={(event) => onTime(event.currentTarget.currentTime)}
          onTimeUpdate={(event) => onTime(event.currentTarget.currentTime)}
          aria-label={video ? `Uploaded video ${video.name}` : "Toulouse versus ASM demo match"}
        />
        <div className="pitch-visual" aria-hidden="true">
          <div className="pitch-midline" />
          <div className="pitch-circle" />
          <div className="post left-post" />
          <div className="post right-post" />
          <div className="rugby-ball-large"><span /></div>
        </div>
        {missing && (
          <div className="video-missing">
            <span className="missing-kicker">{video ? "Video unavailable" : "Demo video placeholder"}</span>
            <strong>{video ? "The uploaded match could not be loaded" : "Add match.mp4 to begin video review"}</strong>
            <p>{video ? "Check that the backend is running and try the upload again." : "Event detection data and all timeline tools remain available."}</p>
          </div>
        )}
        {selected && (
          <div className="fullscreen-event-context">
            <span>Selected event</span>
            <strong>{selected.label}</strong>
            <span>{formatTime(selected.start, true)} – {formatTime(selected.end, true)}</span>
            <span>{Math.round((selected.confidence ?? 0) * 100)}% confidence</span>
          </div>
        )}
        <div className="video-controls">
          <input
            className="video-progress"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(event) => seekTo(Number(event.target.value), "player progress control")}
            aria-label="Seek video"
          />
          <div className="video-control-row">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span>{formatTime(current)} / {formatTime(duration)}</span>
            <div className="control-spacer" />
            <button onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <button onClick={() => {
              const next = speed === 2 ? 0.5 : speed + 0.5;
              setSpeed(next);
              if (videoRef.current) videoRef.current.playbackRate = next;
            }} aria-label="Playback speed"><Gauge size={16} /><span>{speed}×</span></button>
            <button onClick={toggleFullscreen} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {fullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}
            </button>
          </div>
        </div>
      </div>
      <div className="video-footer">
        <span>{video ? "Uploaded source · backend stream" : "Broadcast feed · 1080p"}</span>
        <button onClick={() => seekTo(0, "restart control")}><RotateCcw size={13} /> Restart</button>
      </div>
    </section>
  );
});

VideoPanel.displayName = "VideoPanel";
