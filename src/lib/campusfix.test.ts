import { describe, expect, it } from "vitest";
import {
  complaintsFromCsv,
  computeCost,
  isRetryableError,
  MAX_RETRIES,
  normalizeClassification,
  parseModelJson,
  RETRY_DELAY_MS,
  routeStatus,
  withRetries,
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
  it("prices $0.59 per 1M input and $0.79 per 1M output tokens at ₹85/USD", () => {
    const { usd, inr } = computeCost(1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(1.38, 10);
    expect(inr).toBeCloseTo(117.3, 10);
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

describe("busy detection", () => {
  it("treats 503, 429 and high-demand wording as retryable", () => {
    expect(isRetryableError(503, "Service Unavailable")).toBe(true);
    expect(isRetryableError(429, "This model is currently experiencing high demand")).toBe(true);
    expect(isRetryableError(200, "Model is overloaded")).toBe(true);
  });
  it("leaves real failures alone", () => {
    expect(isRetryableError(400, "Invalid JSON payload")).toBe(false);
    expect(isRetryableError(401, "API key not valid")).toBe(false);
    expect(isRetryableError(403, "Permission denied on project")).toBe(false);
  });
});

describe("retry policy", () => {
  it("waits 2s between retries and tries a busy request 4 times in total", async () => {
    const waits: number[] = [];
    const notices: number[] = [];
    let calls = 0;
    const value = await withRetries(
      async () => {
        calls++;
        if (calls <= 3) throw new Error("This model is currently experiencing high demand");
        return "ok";
      },
      {
        isRetryable: (e) => isRetryableError(503, (e as Error).message),
        sleep: async (ms) => {
          waits.push(ms);
        },
        onRetry: (attempt) => {
          notices.push(attempt);
        },
      },
    );
    expect(value).toBe("ok");
    expect(calls).toBe(MAX_RETRIES + 1);
    expect(waits).toEqual([RETRY_DELAY_MS, RETRY_DELAY_MS, RETRY_DELAY_MS]);
    expect(notices).toEqual([1, 2, 3]);
  });

  it("gives up after 3 retries and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withRetries(
        async () => {
          calls++;
          throw new Error("high demand");
        },
        { isRetryable: () => true, sleep: async () => {} },
      ),
    ).rejects.toThrow("high demand");
    expect(calls).toBe(MAX_RETRIES + 1);
  });

  it("does not retry a request the AI rejected for a real reason", async () => {
    let calls = 0;
    await expect(
      withRetries(
        async () => {
          calls++;
          throw new Error("API key not valid");
        },
        { isRetryable: (e) => isRetryableError(401, (e as Error).message), sleep: async () => {} },
      ),
    ).rejects.toThrow("API key not valid");
    expect(calls).toBe(1);
  });

  it("keeps the policy at 3 retries with a 2 second pause", () => {
    expect(MAX_RETRIES).toBe(3);
    expect(RETRY_DELAY_MS).toBe(2000);
  });
});
