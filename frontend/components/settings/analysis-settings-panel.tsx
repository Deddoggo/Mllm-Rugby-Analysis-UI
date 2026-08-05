"use client";

import {
  BookOpenCheck,
  BrainCircuit,
  ChevronDown,
  Cpu,
  Settings,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAnalysisSettingsStore } from "@/stores/settings-store";

const visionOptions = [
  ["Player Detection", "Locate players in each frame"],
  ["Player Tracking", "Maintain player identities over time"],
  ["Field Keypoints", "Map play to field coordinates"],
] as const;

const knowledgeOptions = [
  ["Rugby Rules RAG", "Ground answers in laws and guidance"],
  ["Match Metadata Retrieval", "Add teams, score, and competition context"],
] as const;

export function AnalysisSettingsPanel() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const eventDetector = useAnalysisSettingsStore((state) => state.eventDetector);
  const vlmProvider = useAnalysisSettingsStore((state) => state.vlmProvider);
  const setEventDetector = useAnalysisSettingsStore((state) => state.setEventDetector);
  const setVlmProvider = useAnalysisSettingsStore((state) => state.setVlmProvider);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="analysis-settings-anchor" ref={containerRef}>
      <button
        type="button"
        className={`icon-button${open ? " active" : ""}`}
        aria-label="Analysis settings"
        aria-expanded={open}
        aria-controls="analysis-settings-panel"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={17} />
      </button>

      {open && (
        <aside
          id="analysis-settings-panel"
          className="analysis-settings-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="analysis-settings-title"
        >
          <header className="analysis-settings-header">
            <div>
              <span className="settings-eyebrow"><Sparkles size={12} /> Analysis pipeline</span>
              <h2 id="analysis-settings-title">Analysis Settings</h2>
              <p>Configure engines and preview upcoming capabilities.</p>
            </div>
            <button type="button" aria-label="Close analysis settings" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <div className="analysis-settings-content">
            <SettingsSection icon={<Cpu size={15} />} title="Event Detection">
              <label className="settings-select-field">
                <span>Event Detection Engine</span>
                <span className="settings-select-control">
                  <select
                    aria-label="Event Detection Engine"
                    value={eventDetector}
                    onChange={(event) => setEventDetector(event.target.value as "mock" | "vjepa2")}
                  >
                    <option value="mock">Mock Event Detector</option>
                    <option value="vjepa2" disabled>V-JEPA2 Detector</option>
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
              <div className="settings-engine-note">
                <strong>V-JEPA2 Detector</strong>
                <span>Requires GPU deployment</span>
              </div>
            </SettingsSection>

            <SettingsSection icon={<BrainCircuit size={15} />} title="Vision Analysis">
              <div className="settings-option-list">
                {visionOptions.map(([label, description]) => (
                  <FutureOption key={label} label={label} description={description} />
                ))}
              </div>
            </SettingsSection>

            <SettingsSection icon={<BookOpenCheck size={15} />} title="Knowledge Augmentation">
              <div className="settings-option-list">
                {knowledgeOptions.map(([label, description]) => (
                  <FutureOption key={label} label={label} description={description} />
                ))}
              </div>
            </SettingsSection>

            <SettingsSection icon={<Sparkles size={15} />} title="Language Model">
              <label className="settings-select-field">
                <span>VLM Provider</span>
                <span className="settings-select-control">
                  <select
                    aria-label="VLM Provider"
                    value={vlmProvider}
                    onChange={(event) => setVlmProvider(event.target.value as "qwen" | "gemma")}
                  >
                    <option value="qwen">Qwen API</option>
                    <option value="gemma" disabled>Local Gemma (future)</option>
                  </select>
                  <ChevronDown size={14} aria-hidden="true" />
                </span>
              </label>
              <div className="settings-provider-status"><i /> Active provider: Qwen API</div>
            </SettingsSection>
          </div>
        </aside>
      )}
    </div>
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

function FutureOption({ label, description }: { label: string; description: string }) {
  return (
    <label className="settings-future-option" aria-disabled="true">
      <span className="settings-option-copy">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="coming-soon">Coming soon</span>
      <input type="checkbox" disabled aria-label={label} />
      <span className="settings-switch" aria-hidden="true" />
    </label>
  );
}
