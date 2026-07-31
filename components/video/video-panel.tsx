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
import { useEffect, useRef, useState } from "react";
import type { VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";

export function VideoPanel({
  current,
  onTime,
  selected,
  previewSignal,
}: {
  current: number;
  onTime: (time: number) => void;
  selected?: VideoEvent;
  previewSignal: number;
}) {
  const playerRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);

  const toggle = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) await video.play();
    else video.pause();
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selected || previewSignal === 0) return;
    video.currentTime = selected.start;
    onTime(selected.start);
    void video.play();
  }, [previewSignal, selected, onTime]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const video = videoRef.current;
      if (!video) return;
      if (event.code === "Space") { event.preventDefault(); void toggle(); }
      if (event.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
      if (event.key === "ArrowRight") video.currentTime = Math.min(300, video.currentTime + 5);
      if (event.key.toLowerCase() === "j") video.currentTime = Math.max(0, video.currentTime - 10);
      if (event.key.toLowerCase() === "l") video.currentTime = Math.min(300, video.currentTime + 10);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(document.fullscreenElement === playerRef.current);
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement === playerRef.current) await document.exitFullscreen();
    else await playerRef.current?.requestFullscreen();
  };

  return (
    <section ref={playerRef} className="video-card" aria-label="Demo match video">
      <div className="match-strip">
        <div><span className="live-dot" /> Demo match</div>
        <strong>Stade Toulousain <b>17</b> <span>—</span> <b>10</b> ASM Clermont</strong>
        <div><span>First half</span><strong>05:00</strong></div>
      </div>
      <div className="video-stage">
        <video
          ref={videoRef}
          src="/demo/match.mp4"
          muted={muted}
          onError={() => setMissing(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            const next = event.currentTarget.currentTime;
            onTime(next);
            if (selected && next >= selected.end) event.currentTarget.pause();
          }}
          aria-label="Toulouse versus ASM demo match"
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
            <span className="missing-kicker">Demo video placeholder</span>
            <strong>Add match.mp4 to begin video review</strong>
            <p>Event detection data and all timeline tools remain available.</p>
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
            max={300}
            step={0.1}
            value={Math.min(current, 300)}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (videoRef.current) videoRef.current.currentTime = next;
              onTime(next);
            }}
            aria-label="Seek video"
          />
          <div className="video-control-row">
            <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span>{formatTime(current)} / 05:00</span>
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
        <span>Broadcast feed · 1080p</span>
        <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; onTime(0); }}><RotateCcw size={13} /> Restart</button>
      </div>
    </section>
  );
}
