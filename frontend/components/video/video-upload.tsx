"use client";

import { CheckCircle2, FileVideo2, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { getVideoStreamUrl, uploadVideo } from "@/services/api";
import { useWorkspaceStore } from "@/stores/workspace-store";

const ACCEPTED_VIDEO_TYPES = ".mp4,.mov,.mkv";
type UploadPhase = "idle" | "uploading" | "processing" | "ready" | "error";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDuration(duration: number | null) {
  if (duration === null) return "Unavailable";
  const hours = Math.floor(duration / 3600);
  const minutes = Math.floor((duration % 3600) / 60);
  const seconds = Math.floor(duration % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VideoUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useWorkspaceStore((state) => state.currentVideo);
  const setCurrentVideo = useWorkspaceStore((state) => state.setCurrentVideo);
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = phase === "uploading" || phase === "processing";

  const submit = async (file?: File) => {
    if (!file || busy) return;
    setPhase("uploading");
    setError(null);
    try {
      const response = await uploadVideo(file, {
        onUploadComplete: () => setPhase((current) => current === "uploading" ? "processing" : current),
      });
      setCurrentVideo({
        id: response.video_id,
        name: response.filename,
        url: getVideoStreamUrl(response.video_id),
        duration: response.duration,
        size: response.size,
      });
      setPhase("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Video upload failed.");
      setPhase("error");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <section className={`upload-card${dragging ? " dragging" : ""}`} aria-label="Upload match video">
      <input
        ref={inputRef}
        className="upload-input"
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        disabled={busy}
        onChange={(event) => void submit(event.target.files?.[0])}
      />
      <button
        type="button"
        className="upload-dropzone"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false); }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void submit(event.dataTransfer.files[0]);
        }}
      >
        <span className="upload-icon">{busy ? <span className="spinner" /> : <UploadCloud size={21} />}</span>
        <span aria-live="polite">
          <strong>{phase === "uploading" ? "Uploading" : phase === "processing" ? "Processing video" : upload ? "Upload another match video" : "Upload a match video"}</strong>
          <small>{phase === "processing" ? "Upload complete. Normalizing for browser playback..." : "Drop an MP4, MOV, or MKV file here, or click to browse"}</small>
        </span>
      </button>

      {upload && phase === "ready" && (
        <div className="upload-result success" role="status">
          <CheckCircle2 size={20} />
          <div>
            <strong>Ready</strong>
            <span><FileVideo2 size={13} /> {upload.name}</span>
          </div>
          <dl>
            <div><dt>Duration</dt><dd>{formatDuration(upload.duration)}</dd></div>
            <div><dt>Size</dt><dd>{formatBytes(upload.size ?? 0)}</dd></div>
          </dl>
        </div>
      )}
      {error && (
        <div className="upload-result error" role="alert">
          <div>
            <strong>Error</strong>
            <span>{error}</span>
          </div>
        </div>
      )}
    </section>
  );
}
