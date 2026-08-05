import { create } from "zustand";
import {
  DEFAULT_ANALYSIS_SETTINGS,
  type AnalysisSettings,
  type EventDetectorEngine,
  type VlmProvider,
} from "@/types/analysis-settings";

interface AnalysisSettingsState extends AnalysisSettings {
  setEventDetector: (eventDetector: EventDetectorEngine) => void;
  setVlmProvider: (vlmProvider: VlmProvider) => void;
  setOption: (
    option: "enablePlayerDetection" | "enableTracking" | "enableFieldKeypoints"
      | "enableRag" | "enableMatchMetadata" | "enableOCR",
    enabled: boolean,
  ) => void;
  reset: () => void;
}

export const useAnalysisSettingsStore = create<AnalysisSettingsState>((set) => ({
  ...DEFAULT_ANALYSIS_SETTINGS,
  setEventDetector: (eventDetector) => set({ eventDetector }),
  setVlmProvider: (vlmProvider) => set({ vlmProvider }),
  setOption: (option, enabled) => set({ [option]: enabled }),
  reset: () => set(DEFAULT_ANALYSIS_SETTINGS),
}));
