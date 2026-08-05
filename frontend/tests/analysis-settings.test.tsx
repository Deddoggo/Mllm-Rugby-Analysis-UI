// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "@/components/layout/app-shell";
import { SettingsPanel } from "@/components/settings/settings-panel";
import { useAnalysisSettingsStore } from "@/stores/settings-store";
import { DEFAULT_ANALYSIS_SETTINGS } from "@/types/analysis-settings";

vi.mock("@/components/ui/app-scroll-area", () => ({
  AppScrollArea: ({ children, testId }: { children: React.ReactNode; testId?: string }) => (
    <div data-testid={testId}>{children}</div>
  ),
}));

describe("analysis settings", () => {
  beforeEach(() => useAnalysisSettingsStore.getState().reset());
  afterEach(cleanup);

  it("starts with the supported mock detector and Qwen provider", () => {
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);

    useAnalysisSettingsStore.getState().openSettings();
    render(<SettingsPanel />);

    expect(screen.getByRole("dialog", { name: "Analysis Settings" })).toBeTruthy();
    expect((screen.getByRole("combobox", { name: "Event Detection Engine" }) as HTMLSelectElement).value).toBe("mock");
    expect((screen.getByRole("option", { name: "V-JEPA2 Detector" }) as HTMLOptionElement).disabled).toBe(true);
    expect(screen.getByText("Requires GPU deployment")).toBeTruthy();
    expect(screen.getByText("Qwen API")).toBeTruthy();
    expect(screen.getByText("qwen3.7-flash")).toBeTruthy();
    expect(screen.getByText("Gemma-4 Local")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "VLM Provider" })).toBeNull();
    expect(screen.getByTestId("analysis-settings-scroll-area")).toBeTruthy();
  });

  it("shows disabled roadmap capabilities without enabling pipeline fields", () => {
    useAnalysisSettingsStore.getState().openSettings();
    render(<SettingsPanel />);

    for (const label of [
      "Player Detection",
      "Player Tracking",
      "Field Keypoints",
      "Rugby Rules RAG",
      "Match Metadata Retrieval",
      "Scoreboard OCR",
    ]) {
      expect((screen.getByRole("checkbox", { name: label }) as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getAllByText("Coming soon")).toHaveLength(6);
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("keeps future selection state isolated from the workspace store", () => {
    useAnalysisSettingsStore.getState().setEventDetector("vjepa2");
    useAnalysisSettingsStore.getState().setOption("enableTracking", true);

    expect(useAnalysisSettingsStore.getState()).toMatchObject({
      eventDetector: "vjepa2",
      enableTracking: true,
    });

    useAnalysisSettingsStore.getState().reset();
    expect(useAnalysisSettingsStore.getState()).toMatchObject(DEFAULT_ANALYSIS_SETTINGS);
  });

  it("uses one shared panel for the topbar and sidebar gear buttons", () => {
    render(<AppShell search="" onSearch={() => undefined}><div>Workspace</div></AppShell>);

    fireEvent.click(screen.getByRole("button", { name: "Analysis settings" }));
    expect(screen.getAllByRole("dialog", { name: "Analysis Settings" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Close analysis settings" }));
    expect(screen.queryByRole("dialog", { name: "Analysis Settings" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Analysis settings from sidebar" }));
    expect(screen.getAllByRole("dialog", { name: "Analysis Settings" })).toHaveLength(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Analysis Settings" })).toBeNull();
  });

  it("updates read-only VLM status from analysis response metadata", () => {
    useAnalysisSettingsStore.getState().setActiveVlmFromAnalysis(
      "qwen:qwen3.7-flash",
      "Qwen API · qwen3.7-flash",
    );

    expect(useAnalysisSettingsStore.getState().activeVlm).toEqual({
      id: "qwen",
      displayName: "Qwen API",
      model: "qwen3.7-flash",
    });
  });
});
