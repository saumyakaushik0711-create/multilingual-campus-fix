// Shared ticket storage in the database: everyone on every device sees the same tickets.
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  duplicateKey,
  mergeTicket,
  type Department,
  type Ticket,
  type TicketStatus,
  type Urgency,
} from "@/lib/campusfix";

type Row = Database["public"]["Tables"]["tickets"]["Row"];
type Insert = Database["public"]["Tables"]["tickets"]["Insert"];

const MAX_TICKETS = 1000;

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

function ticketToRow(t: Ticket): Required<Insert> {
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

export async function fetchTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("last_reported_at", { ascending: false })
    .limit(MAX_TICKETS);
  if (error) throw new Error(error.message);
  return data.map(rowToTicket);
}

/** Oldest ticket in `department` at the same location, skipping `excludeId`. */
async function findDuplicate(department: Department, t: Ticket, excludeId?: string): Promise<Ticket | null> {
  const key = duplicateKey(t.classification.location);
  if (!key) return null;
  let q = supabase
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

async function saveMerge(existing: Ticket, incoming: Ticket, status?: TicketStatus): Promise<Ticket> {
  const merged = { ...mergeTicket(existing, incoming), ...(status ? { status } : {}) };
  const row = ticketToRow(merged);
  const { error } = await supabase
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

export interface ReportResult {
  ticket: Ticket;
  merged: boolean;
}

/** Saves a new complaint, merging it into an open ticket for the same department and location. */
export async function reportTicket(t: Ticket): Promise<ReportResult> {
  const existing = await findDuplicate(t.department, t);
  if (existing) return { ticket: await saveMerge(existing, t), merged: true };
  const { error } = await supabase.from("tickets").insert(ticketToRow(t));
  if (error) throw new Error(error.message);
  return { ticket: t, merged: false };
}

/** Staff approval: moves the ticket to `department`, merging it if that queue already has this location. */
export async function approveTicket(t: Ticket, department: Department): Promise<ReportResult> {
  const approved: Ticket = { ...t, department, status: "approved" };
  const existing = await findDuplicate(department, approved, t.id);
  if (existing) {
    const merged = await saveMerge(existing, approved, existing.status === "review" ? "approved" : undefined);
    await removeTicket(t.id);
    return { ticket: merged, merged: true };
  }
  const { error } = await supabase.from("tickets").update({ department, status: "approved" }).eq("id", t.id);
  if (error) throw new Error(error.message);
  return { ticket: approved, merged: false };
}

export async function removeTicket(id: string): Promise<void> {
  const { error } = await supabase.from("tickets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function clearTickets(): Promise<void> {
  const { error } = await supabase.from("tickets").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}
