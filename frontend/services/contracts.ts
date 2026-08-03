import type {
  AnalysisRequest,
  AnalysisResponse,
  EventClip,
  VideoAsset,
  VideoEvent,
} from "@/lib/domain";

export interface VideoRepository {
  getDemoVideo(): Promise<VideoAsset>;
}

export interface EventRepository {
  getEvents(videoId: string): Promise<VideoEvent[]>;
  detectEvents(videoId: string, force?: boolean): Promise<VideoEvent[]>;
  updateEventBoundaries(videoId: string, eventId: string, start: number, end: number): Promise<VideoEvent>;
}

export interface AnalysisService {
  analyze(request: AnalysisRequest): Promise<AnalysisResponse>;
}

export interface ClipRepository {
  createClip(videoId: string, eventId: string, force?: boolean): Promise<EventClip>;
  getClip(videoId: string, clipId: string): Promise<EventClip>;
  listClips(videoId: string): Promise<EventClip[]>;
}
