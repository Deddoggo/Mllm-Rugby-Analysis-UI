import type {
  AnalysisService,
  ClipPreviewRepository,
  ClipRepository,
  EventRepository,
  VideoRepository,
} from "./contracts";
import {
  ApiAnalysisService,
  ApiClipPreviewRepository,
  ApiClipRepository,
  ApiEventRepository,
  ApiVideoRepository,
} from "./api";
import { MockAnalysisService, MockEventRepository, MockVideoRepository } from "./mock";
import { ClipAwareAnalysisService } from "./analysis";

export interface Services {
  video: VideoRepository;
  events: EventRepository;
  analysis: AnalysisService;
  clips: ClipRepository;
  clipPreviews: ClipPreviewRepository;
}

export function createServices(
  mode = process.env.NEXT_PUBLIC_DATA_MODE ?? "api",
): Services {
  if (mode === "api") {
    return {
      video: new ApiVideoRepository(),
      events: new ApiEventRepository(),
      analysis: new ApiAnalysisService(),
      clips: new ApiClipRepository(),
      clipPreviews: new ApiClipPreviewRepository(),
    };
  }
  return {
    video: new MockVideoRepository(),
    events: new MockEventRepository(),
    analysis: new ClipAwareAnalysisService(
      new MockAnalysisService(),
      new ApiAnalysisService(),
    ),
    clips: new ApiClipRepository(),
    clipPreviews: new ApiClipPreviewRepository(),
  };
}

export const services = createServices();
