import type { AnalysisRequest } from "@/lib/domain";
import { analysisResponseSchema, externalEventsSchema } from "@/lib/domain";
import type { AnalysisService, EventRepository, VideoRepository } from "./contracts";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
