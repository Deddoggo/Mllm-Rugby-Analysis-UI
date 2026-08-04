"use client";

import {
  Expand,
  Gauge,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  forwardRef,
  type ReactNode,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { seekMediaElement } from "@/lib/playback-sync";
import { formatTime } from "@/lib/time";

const MEDIA_DEBUG = process.env.NEXT_PUBLIC_MEDIA_DEBUG === "true";

export interface VideoPlayerProps {
  src: string;
  duration?: number;
  title?: string;
  variant?: "match" | "preview";
  onTimeChange?: (time: number) => void;
  onDurationChange?: (duration: number) => void;
  fallback?: ReactNode;
  children?: ReactNode;
}

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(function VideoPlayer({
  src,
  duration: configuredDuration,
  title = "Video",
  variant = "match",
  onTimeChange,
  onDurationChange,
  fallback,
  children,
}, forwardedRef) {
  const playerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(configuredDuration ?? 0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [missing, setMissing] = useState(false);

  const observeTime = useCallback((time: number) => {
    setCurrentTime(time);
    onTimeChange?.(time);
  }, [onTimeChange]);

  const seekTo = useCallback((seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    const target = seekMediaElement(video, seconds);
    if (MEDIA_DEBUG) console.info("[media-debug] programmatic seek", { target, src });
  }, [src]);

  useImperativeHandle(forwardedRef, () => ({ seekTo }), [seekTo]);

  useEffect(() => {
    if (configuredDuration && Number.isFinite(configuredDuration)) {
      setDuration(configuredDuration);
      onDurationChange?.(configuredDuration);
    }
  }, [configuredDuration, onDurationChange]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    if (!MEDIA_DEBUG) return;
    console.info("[media-debug] player mount", { variant, src });
    return () => console.info("[media-debug] player unmount", { variant, src });
  }, [src, variant]);

  const togglePlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
    else await playerRef.current?.requestFullscreen();
  };

  const cycleSpeed = () => {
    const next = speed === 2 ? 0.5 : speed + 0.5;
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  useEffect(() => {
    if (variant !== "match") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const video = videoRef.current;
      if (!video) return;
      if (event.code === "Space") {
        event.preventDefault();
        void togglePlayback();
      }
      if (event.key === "ArrowLeft") seekTo(video.currentTime - 5);
      if (event.key === "ArrowRight") seekTo(video.currentTime + 5);
      if (event.key.toLowerCase() === "j") seekTo(video.currentTime - 10);
      if (event.key.toLowerCase() === "l") seekTo(video.currentTime + 10);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [seekTo, togglePlayback, variant]);

  return (
    <div
      ref={playerRef}
      className={`video-player video-stage video-player-${variant}`}
      data-variant={variant}
    >
      <video
        ref={videoRef}
        data-testid={variant === "match" ? "match-video" : "clip-preview-video"}
        src={src}
        preload="metadata"
        muted={muted}
        aria-label={title}
        onLoadStart={() => {
          setMissing(false);
          observeTime(0);
        }}
        onError={() => setMissing(true)}
        onLoadedMetadata={(event) => {
          const actualDuration = event.currentTarget.duration;
          if (Number.isFinite(actualDuration)) {
            setDuration(actualDuration);
            onDurationChange?.(actualDuration);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onSeeking={(event) => observeTime(event.currentTarget.currentTime)}
        onSeeked={(event) => observeTime(event.currentTarget.currentTime)}
        onTimeUpdate={(event) => observeTime(event.currentTarget.currentTime)}
      />
      {missing && fallback}
      {children}
      <div className="video-controls">
        <input
          className="video-progress"
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={(event) => seekTo(Number(event.target.value))}
          aria-label="Seek video"
        />
        <div className="video-control-row">
          <button type="button" onClick={() => void togglePlayback()} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
          <div className="control-spacer" />
          <button
            type="button"
            onClick={() => {
              const next = !muted;
              setMuted(next);
              if (videoRef.current) videoRef.current.muted = next;
            }}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <input
            className="video-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(event) => {
              const next = Number(event.target.value);
              setVolume(next);
              setMuted(next === 0);
              if (videoRef.current) {
                videoRef.current.volume = next;
                videoRef.current.muted = next === 0;
              }
            }}
            aria-label="Volume"
          />
          <button type="button" onClick={cycleSpeed} aria-label="Playback speed">
            <Gauge size={16} /><span>{speed}×</span>
          </button>
          <button type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
            {fullscreen ? <Minimize2 size={18} /> : <Expand size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = "VideoPlayer";
