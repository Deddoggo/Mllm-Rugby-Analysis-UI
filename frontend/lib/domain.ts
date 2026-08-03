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

export const analysisResponseSchema = z.object({
  id: z.string(),
  answer: z.string(),
  model: z.string(),
  processingTime: z.number().optional(),
  createdAt: z.string(),
});
