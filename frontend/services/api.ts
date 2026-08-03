import type { AnalysisRequest } from "@/lib/domain";
import { analysisResponseSchema, externalEventsSchema } from "@/lib/domain";
import type { AnalysisService, EventRepository, VideoRepository } from "./contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export interface VideoUploadResponse {
  video_id: string;
  filename: string;
  status: "processed" | "already_exists";
  stream_url: string;
  duration: number | null;
  size: number;
}

interface UploadVideoOptions {
  onUploadComplete?: () => void;
}

function getApiUrl() {
  if (!apiUrl) throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  return apiUrl.replace(/\/$/, "");
}

export function getVideoStreamUrl(videoId: string) {
  return `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/stream`;
}

function uploadErrorMessage(response: unknown, fallback: string) {
  if (!response || typeof response !== "object" || !("detail" in response)) return fallback;
  const detail = (response as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => typeof item === "object" && item && "msg" in item ? String(item.msg) : String(item))
      .join(" ");
  }
  return detail ? JSON.stringify(detail) : fallback;
}

function isVideoUploadResponse(response: unknown): response is VideoUploadResponse {
  if (!response || typeof response !== "object") return false;
  const value = response as Partial<VideoUploadResponse>;
  return typeof value.video_id === "string"
    && typeof value.filename === "string"
    && (value.status === "processed" || value.status === "already_exists")
    && typeof value.stream_url === "string"
    && (value.duration === null || typeof value.duration === "number")
    && typeof value.size === "number";
}

export function uploadVideo(
  file: File,
  options: UploadVideoOptions = {},
): Promise<VideoUploadResponse> {
  const formData = new FormData();
  formData.append("video", file);
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${getApiUrl()}/videos/upload`);
    request.responseType = "json";
    request.upload.addEventListener("load", () => options.onUploadComplete?.());
    request.addEventListener("load", () => {
      const response = request.response as VideoUploadResponse | { detail?: unknown } | null;
      if (request.status >= 200 && request.status < 300) {
        if (isVideoUploadResponse(response)) {
          resolve(response);
        } else {
          reject(new Error("The backend returned an invalid upload response."));
        }
        return;
      }
      reject(new Error(uploadErrorMessage(response, `Video upload failed (${request.status}).`)));
    });
    request.addEventListener("error", () => {
      reject(new Error("The backend could not be reached. Check that it is running and try again."));
    });
    request.addEventListener("abort", () => reject(new Error("Video upload was cancelled.")));
    request.send(formData);
  });
}

export class ApiVideoRepository implements VideoRepository {
  async getDemoVideo() {
    // TODO: replace with POST /api/v1/videos when uploads are enabled.
    return { id: "api-video", name: "Uploaded Match", url: "", duration: 300 };
  }
}

export class ApiEventRepository implements EventRepository {
  async getEvents(videoId: string) {
    const response = await fetch(`${apiUrl}/api/v1/videos/${videoId}/events`);
    if (!response.ok) throw new Error("Backend event service is unavailable.");
    return externalEventsSchema.parse(await response.json()).map((event) => ({
      ...event,
      detectedStart: event.start,
      detectedEnd: event.end,
    }));
  }
}

export class ApiAnalysisService implements AnalysisService {
  async analyze(request: AnalysisRequest) {
    const response = await fetch(`${apiUrl}/api/v1/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("AI analysis backend is unavailable.");
    return analysisResponseSchema.parse(await response.json());
  }
}
