import type { AnalysisService, ClipRepository, EventRepository, VideoRepository } from "./contracts";
import { ApiAnalysisService, ApiClipRepository, ApiEventRepository, ApiVideoRepository } from "./api";
import { MockAnalysisService, MockEventRepository, MockVideoRepository } from "./mock";

export interface Services {
  video: VideoRepository;
  events: EventRepository;
  analysis: AnalysisService;
  clips: ClipRepository;
}

export function createServices(
  mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "mock",
): Services {
  if (mode === "api") {
    return {
      video: new ApiVideoRepository(),
      events: new ApiEventRepository(),
      analysis: new ApiAnalysisService(),
      clips: new ApiClipRepository(),
    };
  }
  return {
    video: new MockVideoRepository(),
    events: new MockEventRepository(),
    analysis: new MockAnalysisService(),
    clips: new ApiClipRepository(),
  };
}

export const services = createServices();
