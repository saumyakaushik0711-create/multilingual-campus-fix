import {
  computeCost,
  isRetryableError,
  normalizeClassification,
  parseModelJson,
  withRetries,
  type Classification,
} from "./campusfix";

export const GROQ_MODEL = "llama-3.3-70b-versatile";
export const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

export const SYSTEM_PROMPT = `You are CampusFix AI, a complaint router for an Indian college campus.
Students write in English, Hinglish (Hindi in Roman script) or Romanised Punjabi, with typos and slang
(e.g. bhai, veere, yaar, h = hai, rha = raha, ch = in, de = of, pankha = fan, nalka = tap, bijli = electricity, khana = food).

Return ONLY a valid JSON object. No markdown, no code fences, no extra text. Exactly these keys:
{
  "department": "Plumbing" | "Electrical" | "Wi-Fi" | "Mess" | "Academic" | "Other",
  "location": { "block": string, "floor": string, "room": string },
  "urgency": "High" | "Medium" | "Low",
  "confidence": integer from 0 to 100,
  "reason": string
}

Rules:
- department MUST be exactly one of: Plumbing, Electrical, Wi-Fi, Mess, Academic, Other.
  Plumbing = water supply, taps, leaks, washrooms, drainage, flush, pipes.
  Electrical = fans, lights, switches, sockets, power cuts, AC, wiring.
  Wi-Fi = internet, LAN, router, network, login portal connectivity.
  Mess = food quality, hygiene of food, mess staff, mess timings, canteen.
  Academic = classes, exams, faculty, attendance, timetable, results, coursework.
  Other = anything that fits none of the above.
- location: copy ONLY what the student explicitly wrote. block like "BH-2" or "A", floor like "4th", room like "304".
  If a part is not mentioned, use exactly "Not specified". Never guess or infer.
- urgency: High = safety risk (sparks, shock, flooding, contaminated food) or many students blocked;
  Medium = broken for a day or more / affects daily life; Low = minor or cosmetic.
- confidence: integer 0-100 for how sure you are of the department. Use a value below 75 if the complaint is vague,
  mixes several issues, or is not clearly a campus issue.
- reason: ONE short line (max 15 words) explaining why you chose the department.`;

export class GroqError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface ClassifyResult {
  classification: Classification;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
  costInr: number;
  /** Times the request was retried because Groq reported it was busy. */
  retries: number;
}

export interface ClassifyOptions {
  /** Called before each wait, with the 1-based retry number and the error that caused it. */
  onRetry?: (attempt: number, error: GroqError) => void;
}

interface GroqResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface RawReply {
  json: GroqResponse;
  latencyMs: number;
}

export async function classifyComplaint(
  text: string,
  apiKey: string,
  options: ClassifyOptions = {},
): Promise<ClassifyResult> {
  const body = {
    model: GROQ_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Complaint: ${text}` },
    ],
  };

  let retries = 0;
  const { json, latencyMs } = await withRetries(
    async (): Promise<RawReply> => {
      const start = performance.now();
      const res = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      const parsed = (await res.json().catch(() => ({}))) as GroqResponse;
      const elapsed = performance.now() - start;
      if (!res.ok) {
        throw new GroqError(parsed.error?.message ?? `Groq request failed (${res.status})`, res.status);
      }
      return { json: parsed, latencyMs: elapsed };
    },
    {
      isRetryable: (error) => error instanceof GroqError && isRetryableError(error.status, error.message),
      onRetry: (attempt, error) => {
        retries = attempt;
        options.onRetry?.(attempt, error as GroqError);
      },
    },
  );

  const replyText = json.choices?.[0]?.message?.content ?? "";
  if (!replyText) throw new GroqError("Groq returned an empty response", 502);

  const classification = normalizeClassification(parseModelJson(replyText));
  const promptTokens = json.usage?.prompt_tokens ?? 0;
  const outputTokens = json.usage?.completion_tokens ?? 0;
  const { usd, inr } = computeCost(promptTokens, outputTokens);

  return { classification, latencyMs, promptTokens, outputTokens, costUsd: usd, costInr: inr, retries };
}
