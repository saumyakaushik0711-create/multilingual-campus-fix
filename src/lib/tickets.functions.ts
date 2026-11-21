// Public server function for saving a new complaint. Students don't sign in, so the database
// no longer accepts writes from the browser; this validates the report and rebuilds every
// server-controlled field (id, status, cost, timestamps) before saving with the admin client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildTicket, computeCost, DEPARTMENTS, NOT_SPECIFIED, URGENCIES } from "@/lib/campusfix";
import { reportTicketWith, type ReportResult } from "@/lib/tickets-store";

const locationPart = z
  .string()
  .trim()
  .max(120)
  .transform((s) => s || NOT_SPECIFIED);

const reportSchema = z.object({
  text: z.string().trim().min(1).max(1000),
  classification: z.object({
    department: z.enum(DEPARTMENTS),
    location: z.object({ block: locationPart, floor: locationPart, room: locationPart }),
    urgency: z.enum(URGENCIES),
    confidence: z.number().int().min(0).max(100),
    reason: z.string().trim().max(500),
  }),
  latencyMs: z.number().finite().min(0).max(600_000),
  promptTokens: z.number().int().min(0).max(1_000_000),
  outputTokens: z.number().int().min(0).max(1_000_000),
});

export type ReportInput = z.input<typeof reportSchema>;

export const reportComplaint = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data }): Promise<ReportResult> => {
    const cost = computeCost(data.promptTokens, data.outputTokens);
    const ticket = buildTicket(data.text, {
      classification: data.classification,
      latencyMs: data.latencyMs,
      promptTokens: data.promptTokens,
      outputTokens: data.outputTokens,
      costUsd: cost.usd,
      costInr: cost.inr,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      return await reportTicketWith(supabaseAdmin, ticket);
    } catch (e) {
      console.error("reportComplaint failed", e);
      throw new Error("Couldn't save the complaint. Please try again.");
    }
  });
