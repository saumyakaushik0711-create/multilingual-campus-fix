import { describe, expect, it } from "vitest";
import {
  buildTicket,
  duplicateKey,
  isDuplicate,
  maxUrgency,
  mergeTicket,
  reportLabel,
  type Department,
  type Ticket,
  chatModels,
  complaintsFromCsv,
  pickBestModel,
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

describe("model choice", () => {
  const LIVE = [
    { id: "whisper-large-v3" },
    { id: "playai-tts" },
    { id: "meta-llama/llama-guard-4-12b" },
    { id: "nomic-embed-text-v1.5" },
    { id: "some-audio-model" },
    { id: "gemma2-9b-it" },
    { id: "llama-3.1-8b-instant" },
    { id: "qwen/qwen3-32b" },
    { id: "mixtral-8x7b-32768" },
    { id: "old-llama-70b", active: false },
  ];

  it("drops audio, whisper, tts, guard, embedding and inactive models", () => {
    expect(chatModels(LIVE)).toEqual(["gemma2-9b-it", "llama-3.1-8b-instant", "qwen/qwen3-32b", "mixtral-8x7b-32768"]);
  });

  it("picks llama-3.3-70b-versatile whenever Groq offers it", () => {
    expect(pickBestModel(["qwen/qwen3-32b", "llama-3.1-8b-instant", "llama-3.3-70b-versatile"])).toBe(
      "llama-3.3-70b-versatile",
    );
  });

  it("prefers llama, then qwen, then mixtral", () => {
    expect(pickBestModel(chatModels(LIVE))).toBe("llama-3.1-8b-instant");
    expect(pickBestModel(["gemma2-9b-it", "mixtral-8x7b-32768", "qwen/qwen3-32b"])).toBe("qwen/qwen3-32b");
    expect(pickBestModel(["gemma2-9b-it", "mixtral-8x7b-32768"])).toBe("mixtral-8x7b-32768");
  });

  it("takes the biggest llama when several are offered", () => {
    expect(pickBestModel(["llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct"])).toBe(
      "meta-llama/llama-4-scout-17b-16e-instruct",
    );
  });

  it("falls back to the first chat model returned, never a speech model", () => {
    expect(pickBestModel(["whisper-large-v3", "gemma2-9b-it", "openai/gpt-oss-20b"])).toBe("gemma2-9b-it");
    expect(pickBestModel(["whisper-large-v3"])).toBeNull();
  });
});

describe("duplicate detection", () => {
  const loc = (block: string, floor: string, room: string) => ({ block, floor, room });
  const NS = "Not specified";
  const make = (text: string, department: Department, location: ReturnType<typeof loc>, extra: Partial<Ticket> = {}) => ({
    ...buildTicket(
      text,
      {
        classification: { department, location, urgency: "Low", confidence: 90, reason: "r" },
        latencyMs: 100,
        promptTokens: 1000,
        outputTokens: 100,
        costUsd: 0.001,
        costInr: 0.085,
      },
      1_000,
    ),
    ...extra,
  });

  it("treats the same department and location as a duplicate, ignoring case and '4th' vs '4'", () => {
    const a = make("tap leak", "Plumbing", loc(NS, "4th", NS));
    expect(isDuplicate(a, "Plumbing", loc(NS, "4", NS))).toBe(true);
    expect(isDuplicate(make("x", "Electrical", loc("BH-2", NS, "304")), "Electrical", loc("bh 2", NS, "Room 304"))).toBe(true);
  });

  it("does not merge across departments", () => {
    const a = make("tap leak", "Plumbing", loc(NS, "4th", NS));
    expect(isDuplicate(a, "Electrical", loc(NS, "4th", NS))).toBe(false);
  });

  it("does not merge different rooms in the same block", () => {
    const a = make("fan", "Electrical", loc("BH-2", NS, "304"));
    expect(isDuplicate(a, "Electrical", loc("BH-2", NS, "305"))).toBe(false);
  });

  it("never merges complaints with no location at all", () => {
    expect(duplicateKey(loc(NS, NS, NS))).toBeNull();
    const a = make("vague", "Other", loc(NS, NS, NS));
    expect(isDuplicate(a, "Other", loc(NS, NS, NS))).toBe(false);
  });

  it("merging makes the badge read 'Reported 2 times' and keeps the second complaint's text", () => {
    const a = make("tap leak", "Plumbing", loc(NS, "4th", NS));
    const b = make("4th floor tap still leaking", "Plumbing", loc(NS, "4", NS), { lastReportedAt: 5_000 });
    const m = mergeTicket(a, b);
    expect(m.reportCount).toBe(2);
    expect(reportLabel(m.reportCount)).toBe("Reported 2 times");
    expect(m.duplicateTexts).toEqual(["4th floor tap still leaking"]);
    expect(m.id).toBe(a.id);
    expect(m.lastReportedAt).toBe(5_000);
  });

  it("shows no badge for a single report", () => {
    expect(reportLabel(1)).toBeNull();
  });

  it("adds up cost and tokens, averages latency and keeps the higher urgency", () => {
    const a = make("a", "Mess", loc("A", NS, NS));
    const b = make("b", "Mess", loc("A", NS, NS), {
      latencyMs: 300,
      costUsd: 0.002,
      classification: { ...a.classification, urgency: "High" },
    });
    const m = mergeTicket(a, b);
    expect(m.costUsd).toBeCloseTo(0.003, 10);
    expect(m.promptTokens).toBe(2000);
    expect(m.latencyMs).toBe(200);
    expect(m.classification.urgency).toBe("High");
    expect(maxUrgency("Low", "Medium")).toBe("Medium");
  });
});
