import { analysisResponseSchema, externalEventsSchema } from "@/lib/domain";
import type { AnalysisRequest, AnalysisResponse, VideoAsset } from "@/lib/domain";
import type { AnalysisService, EventRepository, VideoRepository } from "./contracts";

export class MockVideoRepository implements VideoRepository {
  async getDemoVideo(): Promise<VideoAsset> {
    return {
      id: "demo-toulouse-asm",
      name: "Toulouse vs ASM",
      url: "/demo/match.mp4",
      duration: 300,
    };
  }
}

export class MockEventRepository implements EventRepository {
  async getEvents() {
    const response = await fetch("/demo/events.json");
    if (!response.ok) throw new Error("Event data could not be loaded.");
    const parsed = externalEventsSchema.parse(await response.json());
    return parsed.map((event) => ({
      ...event,
      detectedStart: event.start,
      detectedEnd: event.end,
    }));
  }

  async detectEvents(videoId: string) {
    return this.getEvents(videoId);
  }

  async updateEventBoundaries(
    videoId: string,
    eventId: string,
    start: number,
    end: number,
  ) {
    const event = (await this.getEvents(videoId)).find((item) => item.id === eventId);
    if (!event) throw new Error("Event not found.");
    return { ...event, start, end, adjusted: true };
  }
}

const observations: Record<AnalysisRequest["eventLabel"], string> = {
  Background: "The sequence shows open-phase play without a single classified set piece.",
  "Goal Kick": "The visible setup is consistent with a goal-kick attempt: a static ball, a measured approach, and a follow-through toward the posts.",
  Lineout: "The players form two parallel lines, the ball is thrown into the corridor, and a jumper is supported by lifters.",
  Maul: "The ball carrier remains upright as teammates bind around the contact and the group advances as a connected unit.",
  Scrum: "Both forward packs bind, engage, and maintain a low collective body position while contesting possession.",
};

export class MockAnalysisService implements AnalysisService {
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 900 + Math.random() * 550));
    if (
      process.env.NODE_ENV === "development" &&
      process.env.NEXT_PUBLIC_ENABLE_MOCK_ERRORS === "true"
    ) {
      throw new Error("The mock analysis service is unavailable.");
    }
    return analysisResponseSchema.parse({
      id: crypto.randomUUID(),
      answer: `${observations[request.eventLabel]} For the adjusted clip (${request.start.toFixed(1)}s–${request.end.toFixed(1)}s), the evidence supports a descriptive reading, but not a definitive tactical conclusion. Visual inference is mocked in this demo; connect a V-JEPA2 event service and a video-language model to validate player identities, possession, and intent.`,
      model: "mock-rugby-vlm",
      providerLabel: "Mock VLM",
      processingTime: Math.round(performance.now() - started),
      createdAt: new Date().toISOString(),
    });
  }

  async getConversation(): Promise<[]> {
    return [];
  }
}
