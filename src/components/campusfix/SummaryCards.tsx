import { Coins, Inbox, Timer, UserCheck } from "lucide-react";
import { fmtInr, fmtMs, fmtUsd, type Ticket } from "@/lib/campusfix";

export function SummaryCards({ tickets }: { tickets: Ticket[] }) {
  const total = tickets.length;
  const avgLatency = total ? tickets.reduce((s, t) => s + t.latencyMs, 0) / total : 0;
  const usd = tickets.reduce((s, t) => s + t.costUsd, 0);
  const inr = tickets.reduce((s, t) => s + t.costInr, 0);
  const review = tickets.filter((t) => t.status === "review").length;

  const cards = [
    { label: "Total tickets", value: total.toString(), sub: "classified so far", icon: Inbox },
    { label: "Avg latency", value: total ? fmtMs(avgLatency) : "—", sub: "per Gemini call", icon: Timer },
    { label: "Total cost", value: fmtUsd(usd, 5), sub: fmtInr(inr, 3), icon: Coins },
    { label: "Needs review", value: review.toString(), sub: "confidence < 75%", icon: UserCheck },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium uppercase tracking-wide">{c.label}</span>
            <c.icon className="size-4" />
          </div>
          <div className="mt-2 truncate font-mono text-xl font-semibold tabular-nums sm:text-2xl">{c.value}</div>
          <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
