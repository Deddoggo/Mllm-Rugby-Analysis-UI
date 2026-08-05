import type {
  AnalysisRequest,
  AnalysisResponse,
  ChatMessage,
  EventClip,
  TemporaryClipPreview,
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
  getConversation(videoId: string, clipId: string): Promise<ChatMessage[]>;
}

export interface ClipRepository {
  createClip(videoId: string, eventId: string, force?: boolean): Promise<EventClip>;
  getClip(videoId: string, clipId: string): Promise<EventClip>;
  listClips(videoId: string): Promise<EventClip[]>;
}

export interface ClipPreviewRepository {
  createPreview(videoId: string, eventId: string): Promise<TemporaryClipPreview>;
  deletePreview(videoId: string, previewId: string): Promise<void>;
}
