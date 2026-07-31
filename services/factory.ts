import type { AnalysisService, EventRepository, VideoRepository } from "./contracts";
import { ApiAnalysisService, ApiEventRepository, ApiVideoRepository } from "./api";
import { MockAnalysisService, MockEventRepository, MockVideoRepository } from "./mock";

export interface Services {
  video: VideoRepository;
  events: EventRepository;
  analysis: AnalysisService;
}

export function createServices(
  mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock",
): Services {
  if (mode === "api") {
    return {
      video: new ApiVideoRepository(),
      events: new ApiEventRepository(),
      analysis: new ApiAnalysisService(),
    };
  }
  return {
    video: new MockVideoRepository(),
    events: new MockEventRepository(),
    analysis: new MockAnalysisService(),
  };
}

export const services = createServices();
