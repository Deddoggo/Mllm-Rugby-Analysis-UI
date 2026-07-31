"use client";

import {
  Expand,
  Gauge,
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [speed, setSpeed] = useState(1);

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

  return (
    <section className="video-card" aria-label="Demo match video">
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
        <div className="video-controls">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause size={17} /> : <Play size={17} />}</button>
          <span>{formatTime(current)} / 05:00</span>
          <div className="control-spacer" />
          <button onClick={() => setMuted(!muted)} aria-label={muted ? "Unmute" : "Mute"}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button>
          <button onClick={() => {
            const next = speed === 2 ? 0.5 : speed + 0.5;
            setSpeed(next);
            if (videoRef.current) videoRef.current.playbackRate = next;
          }} aria-label="Playback speed"><Gauge size={16} /><span>{speed}×</span></button>
          <button onClick={() => videoRef.current?.requestFullscreen()} aria-label="Fullscreen"><Expand size={17} /></button>
        </div>
      </div>
      <div className="video-footer">
        <span>Broadcast feed · 1080p</span>
        <button onClick={() => { if (videoRef.current) videoRef.current.currentTime = 0; onTime(0); }}><RotateCcw size={13} /> Restart</button>
      </div>
    </section>
  );
}
