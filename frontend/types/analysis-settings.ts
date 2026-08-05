export type EventDetectorEngine = "mock" | "vjepa2";
export type VlmProvider = "qwen" | "gemma";

export interface AnalysisSettings {
  eventDetector: EventDetectorEngine;
  vlmProvider: VlmProvider;
  enablePlayerDetection: boolean;
  enableTracking: boolean;
  enableFieldKeypoints: boolean;
  enableRag: boolean;
  enableMatchMetadata: boolean;
  enableOCR: boolean;
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  eventDetector: "mock",
  vlmProvider: "qwen",
  enablePlayerDetection: false,
  enableTracking: false,
  enableFieldKeypoints: false,
  enableRag: false,
  enableMatchMetadata: false,
  enableOCR: false,
};
