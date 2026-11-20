// Pure rules for CampusFix AI: departments, routing, cost, JSON parsing, CSV helpers.

export const DEPARTMENTS = ["Plumbing", "Electrical", "Wi-Fi", "Mess", "Academic", "Other"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const URGENCIES = ["High", "Medium", "Low"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const NOT_SPECIFIED = "Not specified";
export const CONFIDENCE_THRESHOLD = 75;
export const INPUT_USD_PER_MILLION = 0.59;
export const OUTPUT_USD_PER_MILLION = 0.79;
export const USD_TO_INR = 85;

/** How many extra attempts a busy-AI request gets, and how long to wait before each one. */
export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 2000;

/** Model used when Groq's live model list can't be loaded, and the first choice when it's available. */
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";
/** Name fragments preferred when auto-picking a chat model, in priority order. */
export const MODEL_PREFERENCE = ["llama", "qwen", "mixtral"] as const;
const NON_CHAT_RE = /whisper|tts|guard|embed|audio|orpheus|playai|transcri/i;

export interface ModelInfo {
  id: string;
  active?: boolean;
}

/** False for speech, text-to-speech, safety-guard and embedding models, which can't classify complaints. */
export function isChatModel(id: string): boolean {
  return !!id.trim() && !NON_CHAT_RE.test(id);
}

/** Usable chat model ids from Groq's /models list, in the order Groq returned them. */
export function chatModels(list: readonly ModelInfo[]): string[] {
  const ids = list.filter((m) => m.active !== false && isChatModel(m.id)).map((m) => m.id);
  return [...new Set(ids)];
}

const modelSizeB = (id: string) => Number(/(\d+(?:\.\d+)?)b(?![a-z])/i.exec(id)?.[1] ?? 0);

/**
 * Best chat model: the default if offered, else the largest llama, then qwen, then mixtral,
 * else the first chat model Groq returned.
 */
export function pickBestModel(ids: readonly string[]): string | null {
  const usable = ids.filter(isChatModel);
  if (usable.includes(DEFAULT_MODEL)) return DEFAULT_MODEL;
  for (const kw of MODEL_PREFERENCE) {
    const matches = usable.filter((id) => id.toLowerCase().includes(kw));
    if (matches.length) return matches.reduce((best, id) => (modelSizeB(id) > modelSizeB(best) ? id : best));
  }
  return usable[0] ?? null;
}

export interface Location {
  block: string;
  floor: string;
  room: string;
}

export interface Classification {
  department: Department;
  location: Location;
  urgency: Urgency;
  confidence: number;
  reason: string;
}

export type TicketStatus = "routed" | "review" | "approved";

export interface Ticket {
  id: string;
  text: string;
  createdAt: number;
  classification: Classification;
  /** Department the ticket currently sits in (may differ from AI after staff reassign). */
  department: Department;
  status: TicketStatus;
  latencyMs: number;
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
  costInr: number;
}

export function computeCost(promptTokens: number, outputTokens: number) {
  const usd =
    (promptTokens * INPUT_USD_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_USD_PER_MILLION) / 1_000_000;
  return { usd, inr: usd * USD_TO_INR };
}

/** Below the threshold goes to human review; at or above goes to the department queue. */
export function routeStatus(confidence: number): Extract<TicketStatus, "routed" | "review"> {
  return confidence < CONFIDENCE_THRESHOLD ? "review" : "routed";
}

const BUSY_RE =
  /high demand|overload|capacity|temporarily unavailable|service unavailable|try again|exhausted|rate limit|is busy/i;

/** True when the AI service says it's swamped: a 503/429 status, or a "high demand" style message. */
export function isRetryableError(status: number, message = ""): boolean {
  return status === 503 || status === 429 || BUSY_RE.test(message);
}

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries?: number;
  /** Pause before each retry. */
  delayMs?: number;
  isRetryable: (error: unknown) => boolean;
  sleep?: (ms: number) => Promise<void>;
  /** Fired before each wait, with the 1-based retry number. */
  onRetry?: (attempt: number, error: unknown) => void;
}

/** Runs `run`, retrying retryable failures up to `retries` times with a fixed pause. */
export async function withRetries<T>(run: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const retries = opts.retries ?? MAX_RETRIES;
  const delayMs = opts.delayMs ?? RETRY_DELAY_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= retries || !opts.isRetryable(error)) throw error;
      attempt++;
      opts.onRetry?.(attempt, error);
      await sleep(delayMs);
    }
  }
}

function normalizeDepartment(value: unknown): Department {
  const v = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  const match = DEPARTMENTS.find((d) => d.toLowerCase().replace(/[^a-z]/g, "") === v);
  return match ?? "Other";
}

function normalizeUrgency(value: unknown): Urgency {
  const v = String(value ?? "").toLowerCase();
  return URGENCIES.find((u) => u.toLowerCase() === v) ?? "Medium";
}

function normalizeLocationPart(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return NOT_SPECIFIED;
  const v = String(value).trim();
  if (!v || /^(n\/?a|null|none|unknown|not specified|-)$/i.test(v)) return NOT_SPECIFIED;
  return v;
}

export function normalizeClassification(raw: unknown): Classification {
  const r = (raw ?? {}) as Record<string, unknown>;
  const loc = (r["location"] ?? {}) as Record<string, unknown>;
  const conf = Math.round(Number(r["confidence"]));
  return {
    department: normalizeDepartment(r["department"]),
    location: {
      block: normalizeLocationPart(loc["block"]),
      floor: normalizeLocationPart(loc["floor"]),
      room: normalizeLocationPart(loc["room"]),
    },
    urgency: normalizeUrgency(r["urgency"]),
    confidence: Number.isFinite(conf) ? Math.min(100, Math.max(0, conf)) : 0,
    reason: String(r["reason"] ?? "").trim() || "No reason given.",
  };
}

/** Extracts the JSON object from a model reply, tolerating ```json fences or stray text. */
export function parseModelJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model did not return valid JSON");
  }
}

export function formatLocation(loc: Location): string {
  const parts: string[] = [];
  if (loc.block !== NOT_SPECIFIED) parts.push(`Block ${loc.block}`.replace(/^Block block\s*/i, "Block "));
  if (loc.floor !== NOT_SPECIFIED) parts.push(`Floor ${loc.floor}`.replace(/^Floor floor\s*/i, "Floor "));
  if (loc.room !== NOT_SPECIFIED) parts.push(`Room ${loc.room}`.replace(/^Room room\s*/i, "Room "));
  return parts.length ? parts.join(" · ") : NOT_SPECIFIED;
}

export const fmtUsd = (v: number, digits = 6) => `$${v.toFixed(digits)}`;
export const fmtInr = (v: number, digits = 4) => `₹${v.toFixed(digits)}`;
export const fmtMs = (v: number) => `${Math.round(v).toLocaleString("en-IN")} ms`;

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

/** Picks the complaint column (header named complaint/text/message) or the first column. */
export function complaintsFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0]!.map((h) => h.trim().toLowerCase());
  const idx = header.findIndex((h) => /complaint|text|message|issue|description/.test(h));
  const body = idx >= 0 ? rows.slice(1) : rows;
  const col = idx >= 0 ? idx : 0;
  return body.map((r) => (r[col] ?? "").trim()).filter(Boolean);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((r) =>
      r
        .map((v) => {
          const s = String(v);
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    )
    .join("\n");
}
