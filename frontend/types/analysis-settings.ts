export type EventDetectorEngine = "mock" | "vjepa2";

export interface ActiveVlmStatus {
  id: string;
  displayName: string;
  model: string;
}

export interface AnalysisSettings {
  eventDetector: EventDetectorEngine;
  enablePlayerDetection: boolean;
  enableTracking: boolean;
  enableFieldKeypoints: boolean;
  enableRag: boolean;
  enableMatchMetadata: boolean;
  enableOCR: boolean;
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  eventDetector: "mock",
  enablePlayerDetection: false,
  enableTracking: false,
  enableFieldKeypoints: false,
  enableRag: false,
  enableMatchMetadata: false,
  enableOCR: false,
};

export const DEFAULT_ACTIVE_VLM: ActiveVlmStatus = {
  id: "qwen",
  displayName: "Qwen API",
  model: "qwen3.7-flash",
};
