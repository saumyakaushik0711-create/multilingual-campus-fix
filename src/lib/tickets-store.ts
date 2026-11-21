// Ticket <-> row mapping and duplicate-merge writes, shared by the browser (staff, via RLS)
// and the server function that saves new reports. Takes the database client as an argument.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  duplicateKey,
  mergeTicket,
  type Department,
  type Ticket,
  type TicketStatus,
  type Urgency,
} from "@/lib/campusfix";

export type Db = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["tickets"]["Row"];
type Insert = Database["public"]["Tables"]["tickets"]["Insert"];

export interface ReportResult {
  ticket: Ticket;
  merged: boolean;
}

export function rowToTicket(r: Row): Ticket {
  return {
    id: r.id,
    text: r.text,
    createdAt: new Date(r.created_at).getTime(),
    classification: {
      department: r.ai_department as Department,
      location: { block: r.block, floor: r.floor, room: r.room },
      urgency: r.urgency as Urgency,
      confidence: r.confidence,
      reason: r.reason,
    },
    department: r.department as Department,
    status: r.status as TicketStatus,
    latencyMs: r.latency_ms,
    promptTokens: r.prompt_tokens,
    outputTokens: r.output_tokens,
    costUsd: r.cost_usd,
    costInr: r.cost_inr,
    reportCount: r.report_count,
    duplicateTexts: r.duplicate_texts,
    lastReportedAt: new Date(r.last_reported_at).getTime(),
  };
}

export function ticketToRow(t: Ticket): Required<Insert> {
  const c = t.classification;
  return {
    id: t.id,
    text: t.text,
    created_at: new Date(t.createdAt).toISOString(),
    last_reported_at: new Date(t.lastReportedAt).toISOString(),
    ai_department: c.department,
    department: t.department,
    block: c.location.block,
    floor: c.location.floor,
    room: c.location.room,
    location_key: duplicateKey(c.location),
    urgency: c.urgency,
    confidence: c.confidence,
    reason: c.reason,
    status: t.status,
    latency_ms: t.latencyMs,
    prompt_tokens: t.promptTokens,
    output_tokens: t.outputTokens,
    cost_usd: t.costUsd,
    cost_inr: t.costInr,
    report_count: t.reportCount,
    duplicate_texts: t.duplicateTexts,
  };
}

/** Oldest ticket in `department` at the same location, skipping `excludeId`. */
export async function findDuplicate(
  db: Db,
  department: Department,
  t: Ticket,
  excludeId?: string,
): Promise<Ticket | null> {
  const key = duplicateKey(t.classification.location);
  if (!key) return null;
  let q = db
    .from("tickets")
    .select("*")
    .eq("department", department)
    .eq("location_key", key)
    .order("created_at", { ascending: true })
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data[0] ? rowToTicket(data[0]) : null;
}

export async function saveMerge(
  db: Db,
  existing: Ticket,
  incoming: Ticket,
  status?: TicketStatus,
): Promise<Ticket> {
  const merged = { ...mergeTicket(existing, incoming), ...(status ? { status } : {}) };
  const row = ticketToRow(merged);
  const { error } = await db
    .from("tickets")
    .update({
      urgency: row.urgency,
      report_count: row.report_count,
      duplicate_texts: row.duplicate_texts,
      last_reported_at: row.last_reported_at,
      latency_ms: row.latency_ms,
      prompt_tokens: row.prompt_tokens,
      output_tokens: row.output_tokens,
      cost_usd: row.cost_usd,
      cost_inr: row.cost_inr,
      status: merged.status,
    })
    .eq("id", existing.id);
  if (error) throw new Error(error.message);
  return merged;
}

/** Saves a new complaint, merging it into an open ticket for the same department and location. */
export async function reportTicketWith(db: Db, t: Ticket): Promise<ReportResult> {
  const existing = await findDuplicate(db, t.department, t);
  if (existing) return { ticket: await saveMerge(db, existing, t), merged: true };
  const { error } = await db.from("tickets").insert(ticketToRow(t));
  if (error) throw new Error(error.message);
  return { ticket: t, merged: false };
}
