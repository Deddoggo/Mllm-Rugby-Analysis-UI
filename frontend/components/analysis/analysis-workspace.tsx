"use client";

import { Eye, Plus, RotateCcw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalysisRequest,
  ChatMessage,
  EventClip,
  TemporaryClipPreview,
  VideoEvent,
} from "@/lib/domain";
import { formatTime, normalizeEventBoundaries } from "@/lib/time";
import {
  getBoundaryPersistenceErrorMessage,
  persistEventBoundaries,
} from "@/lib/event-boundary-persistence";
import { createClip, detectEvents, updateEventBoundaries } from "@/services/api";
import { services } from "@/services/factory";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { AppShell } from "@/components/layout/app-shell";
import { VideoPanel } from "@/components/video/video-panel";
import type { VideoPanelHandle } from "@/components/video/video-panel";
import { VideoUpload } from "@/components/video/video-upload";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { AnalysisPanel } from "./analysis-panel";
import { EventGrid } from "@/components/events/event-grid";
import { prepareEventClip } from "@/lib/clip-selection";
import { ClipPreview } from "./clip-preview";
import type { ClipPreviewStatus } from "./clip-preview";

export function AnalysisWorkspace() {
  const videoPanelRef = useRef<VideoPanelHandle>(null);
  const events = useWorkspaceStore((state) => state.events);
  const currentVideo = useWorkspaceStore((state) => state.currentVideo);
  const selectedId = useWorkspaceStore((state) => state.selectedId);
  const chats = useWorkspaceStore((state) => state.chats);
  const eventDetectionStatus = useWorkspaceStore((state) => state.eventDetectionStatus);
  const eventDetectionError = useWorkspaceStore((state) => state.eventDetectionError);
  const clipStatus = useWorkspaceStore((state) => state.clipStatus);
  const setEvents = useWorkspaceStore((state) => state.setEvents);
  const selectEvent = useWorkspaceStore((state) => state.selectEvent);
  const updateBounds = useWorkspaceStore((state) => state.updateBounds);
  const replaceEvent = useWorkspaceStore((state) => state.replaceEvent);
  const resetBounds = useWorkspaceStore((state) => state.resetBounds);
  const addMessages = useWorkspaceStore((state) => state.addMessages);
  const detectEventsForVideo = useWorkspaceStore((state) => state.detectEventsForVideo);
  const setClipState = useWorkspaceStore((state) => state.setClipState);
  const [search, setSearch] = useState("");
  const [current, setCurrent] = useState(0);
  const [observedDuration, setObservedDuration] = useState({ sourceId: "demo", value: 300 });
  const [clipPreviewOpen, setClipPreviewOpen] = useState(false);
  const [temporaryPreview, setTemporaryPreview] = useState<TemporaryClipPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<ClipPreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewOwnerContext, setPreviewOwnerContext] = useState<string | null>(null);
  const previewArtifactRef = useRef<{ videoId: string; previewId: string } | null>(null);
  const previewRequestRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState("");
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["events", "demo-toulouse-asm"],
    queryFn: () => services.events.getEvents("demo-toulouse-asm"),
    enabled: currentVideo === null,
  });

  useEffect(() => {
    if (!currentVideo && query.data) setEvents(query.data);
  }, [currentVideo, query.data, setEvents]);

  const selected = events.find((event) => event.id === selectedId);
  const visibleEvents = useMemo(
    () => events.filter((event) => event.label.toLowerCase().includes(search.toLowerCase())),
    [events, search],
  );

  const sourceId = currentVideo?.id ?? "demo";
  const playbackDuration = observedDuration.sourceId === sourceId
    ? observedDuration.value
    : currentVideo?.duration ?? 300;

  const observeDuration = useCallback((duration: number) => {
    setObservedDuration({ sourceId, value: duration });
  }, [sourceId]);

  const seekTo = useCallback((seconds: number) => {
    videoPanelRef.current?.seekTo(seconds);
  }, []);

  const selectAndSeek = useCallback((id: string) => {
    const event = useWorkspaceStore.getState().events.find((item) => item.id === id);
    if (!event) return;
    selectEvent(id);
    seekTo(event.start);
  }, [seekTo, selectEvent]);

  const runDetection = useCallback(async (force = false) => {
    if (!currentVideo) return;
    try {
      await detectEventsForVideo(
        currentVideo.id,
        (videoId) => detectEvents(videoId, { force }),
      );
    } catch {
      // The store retains a visible, retryable detection error.
    }
  }, [currentVideo, detectEventsForVideo]);

  const commitBounds = useCallback(async (id: string, start: number, end: number) => {
    const original = useWorkspaceStore.getState().events.find((event) => event.id === id);
    if (!original) return;
    setBoundaryError(null);
    const normalized = normalizeEventBoundaries({
      kind: "normalize",
      start,
      end,
      videoDuration: playbackDuration,
    });
    if (!currentVideo) {
      updateBounds(id, normalized.start, normalized.end);
      return;
    }
    try {
      await persistEventBoundaries({
        original,
        start: normalized.start,
        end: normalized.end,
        videoDuration: playbackDuration,
        updateLocal: updateBounds,
        replaceLocal: replaceEvent,
        persist: (eventId, nextStart, nextEnd) =>
          updateEventBoundaries(currentVideo.id, eventId, nextStart, nextEnd),
      });
    } catch (caught) {
      setBoundaryError(getBoundaryPersistenceErrorMessage(caught));
    }
  }, [currentVideo, playbackDuration, replaceEvent, updateBounds]);

  const resetEventBounds = useCallback((id: string) => {
    const event = useWorkspaceStore.getState().events.find((item) => item.id === id);
    if (!event) return;
    if (currentVideo) {
      void commitBounds(id, event.detectedStart, event.detectedEnd);
    } else {
      resetBounds(id);
    }
  }, [commitBounds, currentVideo, resetBounds]);

  const ensureClip = useCallback(async (event: VideoEvent): Promise<EventClip | null> => {
    if (!currentVideo) return null;
    return prepareEventClip({
      videoId: currentVideo.id,
      event,
      currentClip: useWorkspaceStore.getState().selectedClip,
      create: createClip,
      onState: setClipState,
    });
  }, [currentVideo, setClipState]);

  const discardPreview = useCallback(async () => {
    const artifact = previewArtifactRef.current;
    previewArtifactRef.current = null;
    if (!artifact) return;
    try {
      await services.clipPreviews.deletePreview(artifact.videoId, artifact.previewId);
    } catch {
      // Temporary previews also expire server-side; cleanup is best effort.
    }
  }, []);

  const closePreview = useCallback(() => {
    previewRequestRef.current += 1;
    setClipPreviewOpen(false);
    setTemporaryPreview(null);
    setPreviewStatus("idle");
    setPreviewError(null);
    setPreviewOwnerContext(null);
    void discardPreview();
  }, [discardPreview]);

  const previewContext = currentVideo && selected
    ? `${currentVideo.id}:${selected.id}:${selected.start}:${selected.end}`
    : "none";

  useEffect(() => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    void discardPreview().then(() => {
      if (previewRequestRef.current !== requestId) return;
      setClipPreviewOpen(false);
      setTemporaryPreview(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setPreviewOwnerContext(null);
    });
  }, [discardPreview, previewContext]);

  useEffect(() => () => {
    const artifact = previewArtifactRef.current;
    if (artifact) void services.clipPreviews.deletePreview(artifact.videoId, artifact.previewId);
  }, []);

  const previewClip = useCallback(async () => {
    if (!selected || !currentVideo) return;
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setClipPreviewOpen(true);
    setPreviewStatus("loading");
    setPreviewError(null);
    setTemporaryPreview(null);
    setPreviewOwnerContext(previewContext);
    await discardPreview();
    try {
      const preview = await services.clipPreviews.createPreview(currentVideo.id, selected.id);
      if (previewRequestRef.current !== requestId) {
        await services.clipPreviews.deletePreview(preview.videoId, preview.previewId);
        return;
      }
      previewArtifactRef.current = { videoId: preview.videoId, previewId: preview.previewId };
      setTemporaryPreview(preview);
      setPreviewStatus("ready");
    } catch (caught) {
      if (previewRequestRef.current !== requestId) return;
      setPreviewStatus("error");
      setPreviewError(caught instanceof Error ? caught.message : "Clip preview failed.");
    }
  }, [currentVideo, discardPreview, previewContext, selected]);

  const ask = useCallback(async (question: string) => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    setLastQuestion(question);
    try {
      const clip = currentVideo ? await ensureClip(selected) : null;
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: question,
        createdAt: new Date().toISOString(),
      };
      addMessages(selected.id, [userMessage]);
      const request: AnalysisRequest = {
        videoId: currentVideo?.id ?? "demo-toulouse-asm",
        eventId: selected.id,
        start: selected.start,
        end: selected.end,
        eventLabel: selected.label,
        question,
        clipId: clip?.clipId,
      };
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
  }, [selected, addMessages, currentVideo, ensureClip]);

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

      <VideoUpload />

      {!currentVideo && query.isLoading && <div className="state-card"><span className="spinner" /> Preparing event intelligence…</div>}
      {!currentVideo && query.isError && <div className="state-card error">Event data is invalid or unavailable. <button onClick={() => query.refetch()}>Retry</button></div>}
      {!currentVideo && !query.isLoading && !query.isError && events.length === 0 && <div className="state-card">No event proposals were found for this match.</div>}
      {currentVideo && eventDetectionStatus === "detecting" && <div className="state-card"><span className="spinner" /> Detecting rugby event proposals...</div>}
      {currentVideo && eventDetectionStatus === "error" && (
        <div className="state-card error">
          {eventDetectionError ?? "Event detection failed."}
          <button onClick={() => void runDetection(true)}>Retry</button>
        </div>
      )}
      {currentVideo && eventDetectionStatus === "ready" && events.length === 0 && <div className="state-card">No event proposals were found for this match.</div>}

      {(currentVideo || events.length > 0) && (
        <div className="video-wrap">
          <VideoPanel
            ref={videoPanelRef}
            current={current}
            onTime={setCurrent}
            onDuration={observeDuration}
            selected={selected}
            previewSignal={0}
            video={currentVideo}
            detectionStatus={eventDetectionStatus}
          />
        </div>
      )}

      {events.length > 0 && (
        <>
          <EventTimeline
            events={visibleEvents}
            selectedId={selectedId}
            current={current}
            duration={playbackDuration}
            onSelect={selectAndSeek}
            onSeek={seekTo}
            onBounds={(id, start, end) => void commitBounds(id, start, end)}
            onReset={resetEventBounds}
          />
          {boundaryError && <div className="boundary-error" role="status">{boundaryError}</div>}
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
                <button onClick={() => resetEventBounds(selected.id)}><RotateCcw size={13} /> Reset</button>
                <button><SlidersHorizontal size={13} /> Edit details</button>
                <button className="preview-button" onClick={() => void previewClip()} disabled={!currentVideo || previewStatus === "loading"}><Eye size={13} /> Preview clip</button>
              </div>
            </div>
          ) : <div className="selected-summary empty">Choose an event to inspect and analyze.</div>}
          {clipPreviewOpen && previewOwnerContext === previewContext && selected && currentVideo && (
            <ClipPreview
              event={selected}
              clip={temporaryPreview}
              status={previewStatus}
              error={previewError}
              onClose={closePreview}
              onRetry={() => void previewClip()}
            />
          )}
          <AnalysisPanel
            selected={selected}
            messages={selected ? chats[selected.id] ?? [] : []}
            loading={loading}
            preparingClip={clipStatus === "extracting"}
            error={error}
            onSubmit={ask}
            onRetry={() => lastQuestion && ask(lastQuestion)}
          />
          <EventGrid events={visibleEvents} selectedId={selectedId} onSelect={selectAndSeek} />
        </>
      )}
    </AppShell>
  );
}
