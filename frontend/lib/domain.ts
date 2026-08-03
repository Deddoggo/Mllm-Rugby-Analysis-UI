import { z } from "zod";

export const eventLabelSchema = z.enum([
  "Background",
  "Goal Kick",
  "Lineout",
  "Maul",
  "Scrum",
]);

export type EventLabel = z.infer<typeof eventLabelSchema>;

export interface VideoAsset {
  id: string;
  name: string;
  url: string;
  duration: number | null;
  size?: number;
}

export interface VideoEvent {
  id: string;
  videoId?: string;
  label: EventLabel;
  start: number;
  end: number;
  confidence?: number;
  detectedStart: number;
  detectedEnd: number;
  adjusted?: boolean;
}

export interface AnalysisRequest {
  videoId: string;
  eventId: string;
  start: number;
  end: number;
  eventLabel: EventLabel;
  question: string;
  clipId?: string;
}

export interface EventClip {
  clipId: string;
  videoId: string;
  eventId: string;
  eventLabel: string;
  start: number;
  end: number;
  duration: number;
  status: "ready";
  streamUrl: string;
  extractionProfile: string;
  createdAt: string;
  cached: boolean;
}

export interface AnalysisResponse {
  id: string;
  answer: string;
  model: string;
  processingTime?: number;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  model?: string;
  processingTime?: number;
}

export const externalEventSchema = z.object({
  id: z.string().min(1),
  label: eventLabelSchema,
  start: z.number().nonnegative(),
  end: z.number().positive(),
  confidence: z.number().min(0).max(1).optional(),
}).refine((event) => event.end > event.start, {
  message: "Event end must be after start",
});

export const externalEventsSchema = z.array(externalEventSchema);

export const apiVideoEventSchema = z.object({
  id: z.string().min(1),
  video_id: z.string().min(1),
  label: eventLabelSchema,
  start: z.number().nonnegative(),
  end: z.number().positive(),
  confidence: z.number().min(0).max(1),
  detected_start: z.number().nonnegative(),
  detected_end: z.number().positive(),
  adjusted: z.boolean(),
}).refine((event) => event.end > event.start, {
  message: "Event end must be after start",
});

export const eventListResponseSchema = z.object({
  video_id: z.string().min(1),
  status: z.enum(["not_detected", "ready"]),
  detector: z.string().nullable(),
  created_at: z.string().nullable().optional(),
  events: z.array(apiVideoEventSchema),
});

export type ApiVideoEvent = z.infer<typeof apiVideoEventSchema>;
export type EventListResponse = z.infer<typeof eventListResponseSchema>;

export const apiClipSchema = z.object({
  clip_id: z.string().min(1),
  video_id: z.string().min(1),
  event_id: z.string().min(1),
  event_label: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  duration: z.number().min(2).max(60),
  status: z.literal("ready"),
  stream_url: z.string().min(1),
  extraction_profile: z.string().min(1),
  created_at: z.string().min(1),
  cached: z.boolean(),
}).refine((clip) => clip.end > clip.start, {
  message: "Clip end must be after start",
});

export const clipListResponseSchema = z.object({
  video_id: z.string().min(1),
  clips: z.array(apiClipSchema),
});

export type ApiClip = z.infer<typeof apiClipSchema>;

export const analysisResponseSchema = z.object({
  id: z.string(),
  answer: z.string(),
  model: z.string(),
  processingTime: z.number().optional(),
  createdAt: z.string(),
});
