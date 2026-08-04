import type {
  AnalysisRequest,
  ApiClip,
  ApiClipPreview,
  ApiVideoEvent,
  EventClip,
  TemporaryClipPreview,
  VideoEvent,
} from "@/lib/domain";
import {
  analysisResponseSchema,
  eventListResponseSchema,
  apiVideoEventSchema,
  apiClipSchema,
  apiClipPreviewSchema,
  clipListResponseSchema,
} from "@/lib/domain";
import type {
  AnalysisService,
  ClipPreviewRepository,
  ClipRepository,
  EventRepository,
  VideoRepository,
} from "./contracts";

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
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!configuredUrl) throw new Error("NEXT_PUBLIC_API_URL is not configured.");
  return configuredUrl.replace(/\/$/, "");
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

async function apiErrorMessage(response: Response, fallback: string) {
  try {
    return uploadErrorMessage(await response.json(), fallback);
  } catch {
    return fallback;
  }
}

function mapApiEvent(event: ApiVideoEvent): VideoEvent {
  return {
    id: event.id,
    videoId: event.video_id,
    label: event.label,
    start: event.start,
    end: event.end,
    confidence: event.confidence,
    detectedStart: event.detected_start,
    detectedEnd: event.detected_end,
    adjusted: event.adjusted,
  };
}

function mapApiClip(clip: ApiClip): EventClip {
  const streamUrl = clip.stream_url.startsWith("http")
    ? clip.stream_url
    : `${getApiUrl()}${clip.stream_url}`;
  return {
    clipId: clip.clip_id,
    videoId: clip.video_id,
    eventId: clip.event_id,
    eventLabel: clip.event_label,
    start: clip.start,
    end: clip.end,
    duration: clip.duration,
    status: clip.status,
    streamUrl,
    extractionProfile: clip.extraction_profile,
    createdAt: clip.created_at,
    cached: clip.cached,
  };
}

function mapApiClipPreview(clip: ApiClipPreview): TemporaryClipPreview {
  const streamUrl = clip.stream_url.startsWith("http")
    ? clip.stream_url
    : `${getApiUrl()}${clip.stream_url}`;
  return {
    previewId: clip.preview_id,
    videoId: clip.video_id,
    eventId: clip.event_id,
    eventLabel: clip.event_label,
    start: clip.start,
    end: clip.end,
    duration: clip.duration,
    status: clip.status,
    streamUrl,
    temporary: clip.temporary,
  };
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

export async function detectEvents(
  videoId: string,
  options: { force?: boolean } = {},
): Promise<VideoEvent[]> {
  const query = options.force ? "?force=true" : "";
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/events/detect${query}`,
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Event detection failed (${response.status}).`));
  }
  const payload = eventListResponseSchema.parse(await response.json());
  return payload.events.filter((event) => event.label !== "Background").map(mapApiEvent);
}

export async function getEvents(videoId: string): Promise<VideoEvent[]> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/events`,
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Event loading failed (${response.status}).`));
  }
  const payload = eventListResponseSchema.parse(await response.json());
  return payload.events.filter((event) => event.label !== "Background").map(mapApiEvent);
}

export async function updateEventBoundaries(
  videoId: string,
  eventId: string,
  start: number,
  end: number,
): Promise<VideoEvent> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start, end }),
    },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Event update failed (${response.status}).`));
  }
  return mapApiEvent(apiVideoEventSchema.parse(await response.json()));
}

export async function createClip(
  videoId: string,
  eventId: string,
  force = false,
): Promise<EventClip> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/clips`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId, force }),
    },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Clip extraction failed (${response.status}).`));
  }
  return mapApiClip(apiClipSchema.parse(await response.json()));
}

export async function createClipPreview(
  videoId: string,
  eventId: string,
): Promise<TemporaryClipPreview> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/clips/preview`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: eventId }),
    },
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Clip preview failed (${response.status}).`));
  }
  return mapApiClipPreview(apiClipPreviewSchema.parse(await response.json()));
}

export async function deleteClipPreview(videoId: string, previewId: string): Promise<void> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/clips/preview/${encodeURIComponent(previewId)}`,
    { method: "DELETE" },
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(await apiErrorMessage(response, `Clip preview cleanup failed (${response.status}).`));
  }
}

export async function getClip(videoId: string, clipId: string): Promise<EventClip> {
  const response = await fetch(
    `${getApiUrl()}/videos/${encodeURIComponent(videoId)}/clips/${encodeURIComponent(clipId)}`,
  );
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Clip loading failed (${response.status}).`));
  }
  return mapApiClip(apiClipSchema.parse(await response.json()));
}

export async function listClips(videoId: string): Promise<EventClip[]> {
  const response = await fetch(`${getApiUrl()}/videos/${encodeURIComponent(videoId)}/clips`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response, `Clip loading failed (${response.status}).`));
  }
  return clipListResponseSchema.parse(await response.json()).clips.map(mapApiClip);
}

export class ApiVideoRepository implements VideoRepository {
  async getDemoVideo() {
    // TODO: replace with POST /api/v1/videos when uploads are enabled.
    return { id: "api-video", name: "Uploaded Match", url: "", duration: 300 };
  }
}

export class ApiEventRepository implements EventRepository {
  async getEvents(videoId: string) {
    return getEvents(videoId);
  }

  async detectEvents(videoId: string, force = false) {
    return detectEvents(videoId, { force });
  }

  async updateEventBoundaries(
    videoId: string,
    eventId: string,
    start: number,
    end: number,
  ) {
    return updateEventBoundaries(videoId, eventId, start, end);
  }
}

export class ApiClipRepository implements ClipRepository {
  createClip(videoId: string, eventId: string, force = false) {
    return createClip(videoId, eventId, force);
  }

  getClip(videoId: string, clipId: string) {
    return getClip(videoId, clipId);
  }

  listClips(videoId: string) {
    return listClips(videoId);
  }
}

export class ApiClipPreviewRepository implements ClipPreviewRepository {
  createPreview(videoId: string, eventId: string) {
    return createClipPreview(videoId, eventId);
  }

  deletePreview(videoId: string, previewId: string) {
    return deleteClipPreview(videoId, previewId);
  }
}

export class ApiAnalysisService implements AnalysisService {
  async analyze(request: AnalysisRequest) {
    const response = await fetch(`${getApiUrl()}/api/v1/analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) throw new Error("AI analysis backend is unavailable.");
    return analysisResponseSchema.parse(await response.json());
  }
}
