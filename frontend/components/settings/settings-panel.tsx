"use client";

import {
  CheckCircle2,
  Circle,
  Cpu,
  LockKeyhole,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect } from "react";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { useAnalysisSettingsStore } from "@/stores/settings-store";

const futureFeatures = [
  ["Player Detection", "Locate players in each frame"],
  ["Player Tracking", "Maintain player identities over time"],
  ["Field Keypoints", "Map play to field coordinates"],
  ["Rugby Rules RAG", "Ground answers in laws and guidance"],
  ["Match Metadata Retrieval", "Add teams, score, and competition context"],
  ["Scoreboard OCR", "Read score and match clock overlays"],
] as const;

export function SettingsPanel() {
  const isOpen = useAnalysisSettingsStore((state) => state.isOpen);
  const closeSettings = useAnalysisSettingsStore((state) => state.closeSettings);
  const eventDetector = useAnalysisSettingsStore((state) => state.eventDetector);
  const setEventDetector = useAnalysisSettingsStore((state) => state.setEventDetector);
  const activeVlm = useAnalysisSettingsStore((state) => state.activeVlm);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettings();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [closeSettings, isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <button
        type="button"
        className="analysis-settings-backdrop"
        aria-label="Close analysis settings"
        onClick={closeSettings}
      />
      <aside
        id="analysis-settings-panel"
        className="analysis-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-settings-title"
      >
        <header className="analysis-settings-header">
          <div>
            <span className="settings-eyebrow"><Sparkles size={12} /> Analysis pipeline</span>
            <h2 id="analysis-settings-title">Analysis Settings</h2>
            <p>Configure detection and inspect available AI modules.</p>
          </div>
          <button type="button" aria-label="Dismiss analysis settings" onClick={closeSettings}>
            <X size={16} />
          </button>
        </header>

        <AppScrollArea
          className="analysis-settings-scroll-area"
          viewportClassName="analysis-settings-scroll-viewport"
          contentClassName="analysis-settings-content"
          testId="analysis-settings-scroll-area"
        >
          <SettingsSection icon={<Cpu size={15} />} title="Event Detection">
            <label className="settings-select-field">
              <span>Event Detection Engine</span>
              <select
                aria-label="Event Detection Engine"
                value={eventDetector}
                onChange={(event) => setEventDetector(event.target.value as "mock" | "vjepa2")}
              >
                <option value="mock">Mock Event Detector</option>
                <option value="vjepa2" disabled>V-JEPA2 Detector</option>
              </select>
            </label>
            <div className="settings-engine-list">
              <StatusRow
                active
                title="Mock Event Detector"
                description="Default · Enabled"
                status="Active"
              />
              <StatusRow
                title="V-JEPA2 Detector"
                description="Requires GPU deployment"
                status="Unavailable"
              />
            </div>
          </SettingsSection>

          <SettingsSection icon={<Settings2 size={15} />} title="Future AI Features">
            <div className="settings-option-list">
              {futureFeatures.map(([label, description]) => (
                <FutureOption key={label} label={label} description={description} />
              ))}
            </div>
          </SettingsSection>

          <SettingsSection icon={<Sparkles size={15} />} title="Language Model">
            <div className="settings-provider-copy">
              Provider selection is controlled by the AI-service runtime.
            </div>
            <div className="settings-engine-list">
              <StatusRow
                active
                title={activeVlm.displayName}
                description={activeVlm.model}
                status="Active"
              />
              <StatusRow
                title="Gemma-4 Local"
                description="GPU deployment required"
                status="Unavailable"
              />
            </div>
          </SettingsSection>
        </AppScrollArea>
      </aside>
    </>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="analysis-settings-section">
      <h3>{icon}{title}</h3>
      {children}
    </section>
  );
}

function StatusRow({
  active = false,
  title,
  description,
  status,
}: {
  active?: boolean;
  title: string;
  description: string;
  status: string;
}) {
  return (
    <div className={`settings-status-row${active ? " active" : " unavailable"}`}>
      {active ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      <span className="settings-option-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="settings-status-label">{status}</span>
    </div>
  );
}

function FutureOption({ label, description }: { label: string; description: string }) {
  return (
    <label className="settings-future-option" aria-disabled="true">
      <LockKeyhole size={13} aria-hidden="true" />
      <span className="settings-option-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="coming-soon">Coming soon</span>
      <input type="checkbox" disabled aria-label={label} />
    </label>
  );
}
