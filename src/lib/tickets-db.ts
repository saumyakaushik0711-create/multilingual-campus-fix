// Shared ticket storage in the database: everyone on every device sees the same tickets.
// Anyone can read and report; approving, deleting and clearing need a signed-in staff account
// (enforced by the database's access rules, not just the UI).
import { supabase } from "@/integrations/supabase/client";
import type { Department, Ticket } from "@/lib/campusfix";
import { reportComplaint } from "@/lib/tickets.functions";
import { findDuplicate, rowToTicket, saveMerge, type ReportResult } from "@/lib/tickets-store";

export type { ReportResult } from "@/lib/tickets-store";

const MAX_TICKETS = 1000;

export async function fetchTickets(): Promise<Ticket[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*")
    .order("last_reported_at", { ascending: false })
    .limit(MAX_TICKETS);
  if (error) throw new Error(error.message);
  return data.map(rowToTicket);
}

/** Saves a new complaint through the server, merging it into an open ticket at the same spot. */
export async function reportTicket(t: Ticket): Promise<ReportResult> {
  return reportComplaint({
    data: {
      text: t.text,
      classification: t.classification,
      latencyMs: t.latencyMs,
      promptTokens: t.promptTokens,
      outputTokens: t.outputTokens,
    },
  });
}

/** Staff approval: moves the ticket to `department`, merging it if that queue already has this location. */
export async function approveTicket(t: Ticket, department: Department): Promise<ReportResult> {
  const approved: Ticket = { ...t, department, status: "approved" };
  const existing = await findDuplicate(supabase, department, approved, t.id);
  if (existing) {
    const merged = await saveMerge(
      supabase,
      existing,
      approved,
      existing.status === "review" ? "approved" : undefined,
    );
    await removeTicket(t.id);
    return { ticket: merged, merged: true };
  }
  const { data, error } = await supabase
    .from("tickets")
    .update({ department, status: "approved" })
    .eq("id", t.id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("Only staff can approve tickets");
  return { ticket: approved, merged: false };
}

export async function removeTicket(id: string): Promise<void> {
  const { data, error } = await supabase.from("tickets").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  if (!data.length) throw new Error("Only staff can delete tickets");
}

export async function clearTickets(): Promise<void> {
  const { error } = await supabase.from("tickets").delete().not("id", "is", null);
  if (error) throw new Error(error.message);
}
