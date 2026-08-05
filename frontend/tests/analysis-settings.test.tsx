// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalysisSettingsPanel } from "@/components/settings/analysis-settings-panel";
import { useAnalysisSettingsStore } from "@/stores/settings-store";
import { DEFAULT_ANALYSIS_SETTINGS } from "@/types/analysis-settings";

describe("analysis settings", () => {
  beforeEach(() => useAnalysisSettingsStore.getState().reset());
  afterEach(cleanup);

  it("starts with the supported mock detector and Qwen provider", () => {
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);

    render(<AnalysisSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Analysis settings" }));

    expect(screen.getByRole("dialog", { name: "Analysis Settings" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Event Detection Engine" }) as HTMLSelectElement).value).toBe("mock");
    expect((screen.getByRole("combobox", { name: "VLM Provider" }) as HTMLSelectElement).value).toBe("qwen");
    expect((screen.getByRole("option", { name: "V-JEPA2 Detector" }) as HTMLOptionElement).disabled).toBe(true);
    expect((screen.getByRole("option", { name: "Local Gemma (future)" }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText("Requires GPU deployment")).toBeTruthy();
  });

  it("shows disabled roadmap capabilities without enabling pipeline fields", () => {
    render(<AnalysisSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Analysis settings" }));

    for (const label of [
      "Player Detection",
      "Player Tracking",
      "Field Keypoints",
      "Rugby Rules RAG",
      "Match Metadata Retrieval",
    ]) {
      expect((screen.getByRole("checkbox", { name: label }) as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getAllByText("Coming soon")).toHaveLength(5);
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("keeps future selection state isolated from the workspace store", () => {
    useAnalysisSettingsStore.getState().setEventDetector("vjepa2");
    useAnalysisSettingsStore.getState().setVlmProvider("gemma");
    useAnalysisSettingsStore.getState().setOption("enableTracking", true);

    expect(useAnalysisSettingsStore.getState()).toMatchObject({
      eventDetector: "vjepa2",
      vlmProvider: "gemma",
      enableTracking: true,
    });

    useAnalysisSettingsStore.getState().reset();
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("closes from the close control and Escape key", () => {
    render(<AnalysisSettingsPanel />);
    const trigger = screen.getByRole("button", { name: "Analysis settings" });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close analysis settings" }));
    expect(screen.queryByRole("dialog", { name: "Analysis Settings" })).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Analysis Settings" })).toBeNull();
  });
});
