// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysisPanel } from "@/components/analysis/analysis-panel";
import type { ChatMessage, VideoEvent } from "@/lib/domain";


const selected: VideoEvent = {
  id: "event_001",
  label: "Scrum",
  start: 42,
  end: 55,
  detectedStart: 42,
  detectedEnd: 55,
};

const messages: ChatMessage[] = [
  {
    id: "message_1",
    role: "user",
    content: "Who won this scrum?",
    createdAt: "2026-08-05T12:00:00Z",
  },
  {
    id: "message_2",
    role: "assistant",
    content: "The blue team appears to win it.",
    providerLabel: "Qwen API · qwen3.7-flash",
    model: "qwen:qwen3.7-flash",
    createdAt: "2026-08-05T12:00:01Z",
  },
  {
    id: "message_3",
    role: "user",
    content: "Why?",
    createdAt: "2026-08-05T12:00:02Z",
  },
  {
    id: "message_4",
    role: "assistant",
    content: "They maintain forward pressure.",
    providerLabel: "Qwen API · qwen3.7-flash",
    model: "qwen:qwen3.7-flash",
    createdAt: "2026-08-05T12:00:03Z",
  },
];

afterEach(cleanup);

describe("conversation analysis panel", () => {
  it("renders multiple turns and dynamic provider metadata", () => {
    render(
      <AnalysisPanel
        selected={selected}
        messages={messages}
        loading={false}
        preparingClip={false}
        error={null}
        onSubmit={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("Who won this scrum?")).toBeTruthy();
    expect(screen.getByText("Why?")).toBeTruthy();
    expect(screen.getAllByText("Qwen API · qwen3.7-flash").length).toBeGreaterThan(1);
  });

  it("shows only the newly selected clip conversation", () => {
    const view = render(
      <AnalysisPanel
        selected={selected}
        messages={messages}
        loading={false}
        preparingClip={false}
        error={null}
        onSubmit={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    view.rerender(
      <AnalysisPanel
        selected={{ ...selected, id: "event_002", label: "Lineout" }}
        messages={[]}
        loading={false}
        preparingClip={false}
        error={null}
        onSubmit={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(screen.queryByText("Who won this scrum?")).toBeNull();
    expect(screen.getByText("How can I help analyze this phase?")).toBeTruthy();
  });
});
