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
