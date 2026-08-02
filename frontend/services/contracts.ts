import type {
  AnalysisRequest,
  AnalysisResponse,
  VideoAsset,
  VideoEvent,
} from "@/lib/domain";

export interface VideoRepository {
  getDemoVideo(): Promise<VideoAsset>;
}

export interface EventRepository {
  getEvents(videoId: string): Promise<VideoEvent[]>;
}

export interface AnalysisService {
  analyze(request: AnalysisRequest): Promise<AnalysisResponse>;
}
