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
  duration: number;
}

export interface VideoEvent {
  id: string;
  label: EventLabel;
  start: number;
  end: number;
  confidence?: number;
  detectedStart: number;
  detectedEnd: number;
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

export const analysisResponseSchema = z.object({
  id: z.string(),
  answer: z.string(),
  model: z.string(),
  processingTime: z.number().optional(),
  createdAt: z.string(),
});
