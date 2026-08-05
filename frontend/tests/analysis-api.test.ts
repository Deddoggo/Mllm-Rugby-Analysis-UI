import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRequest } from "@/lib/domain";
import { ApiAnalysisService } from "@/services/api";
import { ClipAwareAnalysisService } from "@/services/analysis";
import type { AnalysisService } from "@/services/contracts";


const request: AnalysisRequest = {
  videoId: "match_20260803_abcd1234",
  eventId: "event_001",
  clipId: "clip_event_001_abcd1234",
  eventLabel: "Scrum",
  start: 42,
  end: 55,
  question: "Explain this scrum phase",
};

describe("backend analysis gateway", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://backend.test";
    vi.stubGlobal("crypto", { randomUUID: () => "analysis_001" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends only the question to the prepared-clip backend endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      answer: "This is a scrum phase.",
      provider: "mock-rugby-vlm",
      provider_metadata: {
        id: "mock",
        display_name: "Mock VLM",
        model: null,
      },
      conversation_id: "conv_001",
      turn_number: 1,
      confidence: "limited",
      metadata: { context_used: { event: {}, clip: {}, video: {} } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await new ApiAnalysisService().analyze(request);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://backend.test/videos/${request.videoId}/clips/${request.clipId}/analysis`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ question: request.question }),
      }),
    );
    expect(response.answer).toBe("This is a scrum phase.");
    expect(response.model).toBe("mock-rugby-vlm");
    expect(response.providerLabel).toBe("Mock VLM");
    expect(response.conversationId).toBe("conv_001");
  });

  it("loads and maps persisted multi-turn conversation history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      conversation_id: "conv_001",
      video_id: request.videoId,
      event_id: request.eventId,
      clip_id: request.clipId,
      messages: [
        {
          role: "user",
          content: "Who won?",
          created_at: "2026-08-05T12:00:00Z",
        },
        {
          role: "assistant",
          content: "The blue team appears to win it.",
          provider: "qwen:qwen3.7-flash",
          provider_metadata: {
            id: "qwen",
            display_name: "Qwen API",
            model: "qwen3.7-flash",
          },
          created_at: "2026-08-05T12:00:01Z",
        },
      ],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const messages = await new ApiAnalysisService().getConversation(
      request.videoId,
      request.clipId!,
    );

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: "assistant",
      content: "The blue team appears to win it.",
      providerLabel: "Qwen API · qwen3.7-flash",
    });
  });

  it("routes prepared clips to the gateway and clipless demos to the mock", async () => {
    const demo = { analyze: vi.fn().mockResolvedValue({}) } as unknown as AnalysisService;
    const gateway = { analyze: vi.fn().mockResolvedValue({}) } as unknown as AnalysisService;
    const service = new ClipAwareAnalysisService(demo, gateway);

    await service.analyze(request);
    await service.analyze({ ...request, clipId: undefined });

    expect(gateway.analyze).toHaveBeenCalledOnce();
    expect(demo.analyze).toHaveBeenCalledOnce();
  });
});
