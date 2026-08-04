import { describe, expect, it } from "vitest";
import { externalEventsSchema } from "@/lib/domain";
import { formatTime, validateBounds } from "@/lib/time";
import { createServices } from "@/services/factory";

describe("event domain", () => {
  it("parses valid event proposals", () => {
    const events = externalEventsSchema.parse([
      { id: "event_1", label: "Scrum", start: 42, end: 55, confidence: 0.92 },
    ]);
    expect(events[0].label).toBe("Scrum");
  });

  it("rejects inverted event intervals", () => {
    expect(() => externalEventsSchema.parse([
      { id: "event_1", label: "Scrum", start: 55, end: 42, confidence: 0.92 },
    ])).toThrow();
  });
});

describe("timeline utilities", () => {
  it("formats match timestamps", () => {
    expect(formatTime(42)).toBe("00:42");
    expect(formatTime(96.2, true)).toBe("01:36.2");
  });

  it("enforces minimum, maximum, and video bounds", () => {
    expect(validateBounds(-4, 1, 300)).toEqual({ start: 0, end: 2 });
    expect(validateBounds(290, 400, 300)).toEqual({ start: 290, end: 300 });
    expect(validateBounds(10, 90, 300)).toEqual({ start: 10, end: 70 });
  });
});

describe("service factory", () => {
  it("switches repository implementations without changing UI contracts", () => {
    expect(createServices("mock").analysis.constructor.name).toBe("ClipAwareAnalysisService");
    expect(createServices("api").analysis.constructor.name).toBe("ApiAnalysisService");
  });
});
