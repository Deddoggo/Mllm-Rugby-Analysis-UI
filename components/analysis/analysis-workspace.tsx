"use client";

import { Eye, Plus, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AnalysisRequest, ChatMessage } from "@/lib/domain";
import { formatTime } from "@/lib/time";
import { services } from "@/services/factory";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { AppShell } from "@/components/layout/app-shell";
import { VideoPanel } from "@/components/video/video-panel";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { AnalysisPanel } from "./analysis-panel";
import { EventGrid } from "@/components/events/event-grid";

export function AnalysisWorkspace() {
  const events = useWorkspaceStore((state) => state.events);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const chats = useWorkspaceStore((state) => state.chats);
  const setEvents = useWorkspaceStore((state) => state.setEvents);
  const selectEvent = useWorkspaceStore((state) => state.selectEvent);
  const updateBounds = useWorkspaceStore((state) => state.updateBounds);
  const resetBounds = useWorkspaceStore((state) => state.resetBounds);
  const addMessages = useWorkspaceStore((state) => state.addMessages);
  const [search, setSearch] = useState("");
  const [current, setCurrent] = useState(0);
  const [previewSignal, setPreviewSignal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const query = useQuery({
    queryKey: ["events", "demo-toulouse-asm"],
    queryFn: () => services.events.getEvents("demo-toulouse-asm"),
  });

  useEffect(() => {
    if (query.data) setEvents(query.data);
  }, [query.data, setEvents]);

  const selected = events.find((event) => event.id === selectedId);
  const visibleEvents = useMemo(
    () => events.filter((event) => event.label.toLowerCase().includes(search.toLowerCase())),
    [events, search],
  );

  const ask = useCallback(async (question: string) => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setLastQuestion(question);
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      createdAt: new Date().toISOString(),
    };
    addMessages(selected.id, [userMessage]);
    const request: AnalysisRequest = {
      videoId: "demo-toulouse-asm",
      eventId: selected.id,
      start: selected.start,
      end: selected.end,
      eventLabel: selected.label,
      question,
    };
    try {
      const response = await services.analysis.analyze(request);
      addMessages(selected.id, [{
        id: response.id,
        role: "assistant",
        content: response.answer,
        createdAt: response.createdAt,
        model: response.model,
        processingTime: response.processingTime,
      }]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Analysis failed.");
    } finally {
      setLoading(false);
    }
  }, [selected, addMessages]);

  return (
    <AppShell search={search} onSearch={setSearch}>
      <div className="workspace-header">
        <div>
          <span className="workspace-kicker">Multimodal behavioral analysis</span>
          <h1>Rugby Video Analysis</h1>
          <p>Explore detected match events, refine temporal boundaries, and ask questions about selected rugby sequences.</p>
        </div>
        <button className="primary-action" onClick={() => window.location.reload()}><Plus size={17} /> New Analysis</button>
      </div>

      {query.isLoading && <div className="state-card"><span className="spinner" /> Preparing event intelligence…</div>}
      {query.isError && <div className="state-card error">Event data is invalid or unavailable. <button onClick={() => query.refetch()}>Retry</button></div>}
      {!query.isLoading && !query.isError && events.length === 0 && <div className="state-card">No event proposals were found for this match.</div>}

      {events.length > 0 && (
        <>
          <div className="video-wrap">
            <VideoPanel current={current} onTime={setCurrent} selected={selected} previewSignal={previewSignal} />
          </div>
          <EventTimeline
            events={visibleEvents}
            selectedId={selectedId}
            current={current}
            onSelect={(id) => {
              selectEvent(id);
              const item = events.find((event) => event.id === id);
              if (item) setCurrent(item.start);
            }}
            onSeek={setCurrent}
            onBounds={updateBounds}
            onReset={resetBounds}
          />
          {selected ? (
            <div className="selected-summary">
              <span className="selected-label">{selected.label}</span>
              <span><ShieldCheck size={13} /> {Math.round((selected.confidence ?? 0) * 100)}% confidence</span>
              <i />
              <span>Detected {formatTime(selected.detectedStart, true)} → {formatTime(selected.detectedEnd, true)}</span>
              <i />
              <strong>{formatTime(selected.start, true)} → {formatTime(selected.end, true)}</strong>
              <span>{(selected.end - selected.start).toFixed(1)}s adjusted</span>
              <div className="summary-actions">
                <button onClick={() => resetBounds(selected.id)}><RotateCcw size={13} /> Reset</button>
                <button><SlidersHorizontal size={13} /> Edit details</button>
                <button className="preview-button" onClick={() => setPreviewSignal((value) => value + 1)}><Eye size={13} /> Preview clip</button>
              </div>
            </div>
          ) : <div className="selected-summary empty">Choose an event to inspect and analyze.</div>}
          <AnalysisPanel
            selected={selected}
            messages={selected ? chats[selected.id] ?? [] : []}
            loading={loading}
            error={error}
            onSubmit={ask}
            onRetry={() => lastQuestion && ask(lastQuestion)}
          />
          <EventGrid events={visibleEvents} selectedId={selectedId} onSelect={selectEvent} />
        </>
      )}
    </AppShell>
  );
}
