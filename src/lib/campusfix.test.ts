import { describe, expect, it } from "vitest";
import {
  complaintsFromCsv,
  computeCost,
  normalizeClassification,
  parseModelJson,
  routeStatus,
} from "./campusfix";

describe("routing", () => {
  it("sends confidence 74 to human review", () => {
    expect(routeStatus(74)).toBe("review");
  });
  it("routes confidence 75 straight to the department", () => {
    expect(routeStatus(75)).toBe("routed");
  });
});

describe("cost", () => {
  it("prices $0.10 per 1M input and $0.40 per 1M output tokens at ₹85/USD", () => {
    const { usd, inr } = computeCost(1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(0.5, 10);
    expect(inr).toBeCloseTo(42.5, 10);
  });
});

describe("classification normalising", () => {
  it("forces unknown departments to Other and blank locations to Not specified", () => {
    const c = normalizeClassification({
      department: "Hostel",
      location: { block: "BH-2", floor: "", room: null },
      urgency: "high",
      confidence: 140,
      reason: "x",
    });
    expect(c.department).toBe("Other");
    expect(c.location).toEqual({ block: "BH-2", floor: "Not specified", room: "Not specified" });
    expect(c.urgency).toBe("High");
    expect(c.confidence).toBe(100);
  });
  it("maps 'wifi' to Wi-Fi", () => {
    expect(normalizeClassification({ department: "wifi" }).department).toBe("Wi-Fi");
  });
  it("parses JSON wrapped in code fences", () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe("csv", () => {
  it("uses the complaint column and handles quoted commas", () => {
    const csv = 'id,complaint\n1,"tap leak, 4th floor"\n2,fan not working\n';
    expect(complaintsFromCsv(csv)).toEqual(["tap leak, 4th floor", "fan not working"]);
  });
});
