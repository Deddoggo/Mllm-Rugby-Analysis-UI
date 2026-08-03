"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Clipboard,
  Database,
  Film,
  LoaderCircle,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { useState } from "react";
import type { ChatMessage, VideoEvent } from "@/lib/domain";
import { formatTime } from "@/lib/time";

const prompts = [
  "Describe the visible actions in chronological order.",
  "Which team appears to control the ball?",
  "Is the evidence sufficient for a tactical conclusion?",
];

export function AnalysisPanel({
  selected,
  messages,
  loading,
  preparingClip,
  error,
  onSubmit,
  onRetry,
}: {
  selected?: VideoEvent;
  messages: ChatMessage[];
  loading: boolean;
  preparingClip: boolean;
  error: string | null;
  onSubmit: (question: string) => void;
  onRetry: () => void;
}) {
  const [question, setQuestion] = useState("");

  const submit = () => {
    if (!selected || !question.trim() || loading) return;
    onSubmit(question.trim());
    setQuestion("");
  };

  return (
    <section className="analysis-panel">
      {messages.length === 0 && !loading ? (
        <div className="analysis-empty">
          <div className="analysis-ball" aria-hidden="true"><span /><i /><b /></div>
          <h2>How can I help analyze this phase?</h2>
          <p>Select an event, refine its boundaries, then ask for a structured visual interpretation.</p>
        </div>
      ) : (
        <div className="chat-history" aria-live="polite">
          {messages.map((message) => (
            <article className={`chat-message ${message.role}`} key={message.id}>
              <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : "AT"}</div>
              <div>
                <header><strong>{message.role === "assistant" ? "Rugby analysis assistant" : "You"}</strong><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></header>
                <p>{message.content}</p>
                {message.model && (
                  <footer>
                    <span>{message.model}</span>
                    <span>{message.processingTime} ms</span>
                    <span className="uncertainty"><i /> Interpretive confidence: limited</span>
                    <button aria-label="Copy answer"><Clipboard size={13} /></button>
                    <button aria-label="Retry answer" onClick={onRetry}><RefreshCw size={13} /></button>
                  </footer>
                )}
              </div>
            </article>
          ))}
          {loading && <div className="analysis-loading"><span /><span /><span /> {preparingClip ? "Preparing selected clip before mock analysis…" : "Mock analysis is reviewing the prepared clip…"}</div>}
          {error && <div className="analysis-error">{error}<button onClick={onRetry}>Try again</button></div>}
        </div>
      )}

      <div className={`composer ${loading ? "is-loading" : ""} ${!selected ? "is-disabled" : ""}`} aria-busy={loading}>
        <div className="composer-context">
          <span><Film size={14} /> {selected ? `${selected.label} · ${formatTime(selected.start, true)}–${formatTime(selected.end, true)}` : "No event selected"}</span>
          <span className="context-ready"><Check size={12} /> Context ready</span>
        </div>
        <TextareaAutosize
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
          }}
          placeholder="Ask about the selected rugby event…"
          disabled={!selected || loading}
          minRows={3}
          maxRows={8}
          cacheMeasurements
          aria-label="Question about selected rugby event"
        />
        <div className="prompt-row">
          {prompts.map((prompt) => <button key={prompt} onClick={() => setQuestion(prompt)}>{prompt}</button>)}
        </div>
        <div className="composer-footer">
          <div>
            <button><Film size={14} /> Selected clip</button>
            <button><Database size={14} /> Event metadata</button>
            <button>Rugby knowledge <span className="toggle on" /></button>
            <button>Concise answer <ChevronDown size={13} /></button>
          </div>
          <span className="mock-label">Mock backend</span>
          <button className="send-button" onClick={submit} disabled={!selected || !question.trim() || loading} aria-label={loading ? "Analysis in progress" : "Send question"}>
            {loading ? <LoaderCircle className="send-spinner" size={17} /> : <ArrowUp size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}
