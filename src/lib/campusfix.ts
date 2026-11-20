// Pure rules for CampusFix AI: departments, routing, cost, JSON parsing, CSV helpers.

export const DEPARTMENTS = ["Plumbing", "Electrical", "Wi-Fi", "Mess", "Academic", "Other"] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const URGENCIES = ["High", "Medium", "Low"] as const;
export type Urgency = (typeof URGENCIES)[number];

export const NOT_SPECIFIED = "Not specified";
export const CONFIDENCE_THRESHOLD = 75;
export const INPUT_USD_PER_MILLION = 0.1;
export const OUTPUT_USD_PER_MILLION = 0.4;
export const USD_TO_INR = 85;

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
