import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyComplaint } from "./gemini";

const OK_BODY = {
  candidates: [
    {
      content: {
        parts: [
          {
            text: '{"department":"Plumbing","location":{"block":"BH-2","floor":"4th","room":"304"},"urgency":"Medium","confidence":92,"reason":"tap leak"}',
          },
        ],
      },
    },
  ],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
};

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

describe("classifyComplaint retry wiring", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("waits 2s and retries a 503 high-demand reply until it succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(503, { error: { message: "This model is currently experiencing high demand" } }))
      .mockResolvedValueOnce(reply(503, { error: { message: "Model is overloaded" } }))
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

    expect(result.classification.department).toBe("Plumbing");
    expect(result.retries).toBe(2);
    expect(notices).toEqual([1, 2]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces a bad key straight away without retrying", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(401, { error: { message: "API key not valid" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(classifyComplaint("test", "bad-key")).rejects.toThrow("API key not valid");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
