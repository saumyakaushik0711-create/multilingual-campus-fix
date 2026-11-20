import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyComplaint, GROQ_ENDPOINT, GROQ_MODEL } from "./groq";

const OK_BODY = {
  choices: [
    {
      message: {
        content:
          '{"department":"Plumbing","location":{"block":"BH-2","floor":"4th","room":"304"},"urgency":"Medium","confidence":92,"reason":"tap leak"}',
      },
    },
  ],
  usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 },
};

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("classifyComplaint via Groq", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("calls Groq chat completions with llama-3.3-70b-versatile and the user's key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await classifyComplaint("tap leak", "gsk_test");

    expect(GROQ_ENDPOINT).toBe("https://api.groq.com/openai/v1/chat/completions");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(GROQ_ENDPOINT);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer gsk_test");
    const sent = JSON.parse(String(init.body)) as { model: string };
    expect(sent.model).toBe("llama-3.3-70b-versatile");
    expect(GROQ_MODEL).toBe("llama-3.3-70b-versatile");
  });

  it("prices usage.prompt_tokens and usage.completion_tokens at $0.59/$0.79 per 1M", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(200, OK_BODY)));
    const r = await classifyComplaint("tap leak", "gsk_test");
    expect(r.promptTokens).toBe(1_000_000);
    expect(r.outputTokens).toBe(1_000_000);
    expect(r.costUsd).toBeCloseTo(1.38, 10);
    expect(r.costInr).toBeCloseTo(117.3, 10);
    expect(r.classification.department).toBe("Plumbing");
  });

  it("waits 2s and retries a 503 high-demand reply until it succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { error: { message: "Service Unavailable" } }))
      .mockResolvedValueOnce(reply(429, { error: { message: "Rate limit reached" } }))
      .mockResolvedValueOnce(reply(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const notices: number[] = [];
    const pending = classifyComplaint("bhai tap leak kar rha h", "key", {
      onRetry: (attempt) => {
        notices.push(attempt);
      },
    });
    await vi.advanceTimersByTimeAsync(4000);
    const result = await pending;

    expect(result.retries).toBe(2);
    expect(notices).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces a bad key straight away without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(401, { error: { message: "Invalid API Key" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(classifyComplaint("test", "bad-key")).rejects.toThrow("Invalid API Key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
