import { create } from "zustand";
import {
  DEFAULT_ANALYSIS_SETTINGS,
  DEFAULT_ACTIVE_VLM,
  type ActiveVlmStatus,
  type AnalysisSettings,
  type EventDetectorEngine,
} from "@/types/analysis-settings";

interface AnalysisSettingsState extends AnalysisSettings {
  isOpen: boolean;
  activeVlm: ActiveVlmStatus;
  openSettings: () => void;
  closeSettings: () => void;
  setEventDetector: (eventDetector: EventDetectorEngine) => void;
  setActiveVlmFromAnalysis: (provider?: string, providerLabel?: string) => void;
  setOption: (
    option: "enablePlayerDetection" | "enableTracking" | "enableFieldKeypoints"
      | "enableRag" | "enableMatchMetadata" | "enableOCR",
    enabled: boolean,
  ) => void;
  reset: () => void;
}

export const useAnalysisSettingsStore = create<AnalysisSettingsState>((set) => ({
  ...DEFAULT_ANALYSIS_SETTINGS,
  isOpen: false,
  activeVlm: DEFAULT_ACTIVE_VLM,
  openSettings: () => set({ isOpen: true }),
  closeSettings: () => set({ isOpen: false }),
  setEventDetector: (eventDetector) => set({ eventDetector }),
  setActiveVlmFromAnalysis: (provider, providerLabel) => {
    if (!provider && !providerLabel) return;
    const [providerId, model = ""] = provider?.split(":", 2) ?? [];
    const [displayName, labelModel = ""] = providerLabel?.split(" · ", 2) ?? [];
    set({
      activeVlm: {
        id: providerId || DEFAULT_ACTIVE_VLM.id,
        displayName: displayName || providerId || DEFAULT_ACTIVE_VLM.displayName,
        model: model || labelModel || provider || DEFAULT_ACTIVE_VLM.model,
      },
    });
  },
  setOption: (option, enabled) => set({ [option]: enabled }),
  reset: () => set({
    ...DEFAULT_ANALYSIS_SETTINGS,
    isOpen: false,
    activeVlm: DEFAULT_ACTIVE_VLM,
  }),
}));
