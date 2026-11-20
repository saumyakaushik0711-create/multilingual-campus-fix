import { useRef, useState } from "react";
import { Download, FileUp, Loader2, Play, Square, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  complaintsFromCsv,
  fmtInr,
  fmtMs,
  fmtUsd,
  formatLocation,
  MAX_RETRIES,
  routeStatus,
  toCsv,
  type Ticket,
} from "@/lib/campusfix";
import { classifyComplaint, GroqError, type ClassifyResult } from "@/lib/groq";
import { ConfidenceBadge, DeptBadge, UrgencyBadge } from "./meta";

const BULK_SAMPLES = [
  "bhai 4th floor ka washroom ka tap 3 din se leak kar rha h",
  "veere BH-2 de room 304 ch pankha nahi chal reha",
  "hostel wifi bahut slow hai yaar, block C mein raat ko connect hi nahi hota",
  "mess mein aaj khane mein baal nikla, bahut ganda tha",
  "Room 112 A block ke switch board se sparks aa rahe hain, urgent!!",
  "DBMS ki class ka timetable clash ho raha hai OS lab ke saath",
  "paaji 2nd floor te geyser ton paani hi nahi aa reha",
  "library ke bahar stray dogs bahut ho gaye hain",
];

interface Row {
  text: string;
  result?: ClassifyResult;
  error?: string;
}

interface Props {
  apiKey: string;
  onNeedKey: () => void;
  onTickets: (t: Ticket[]) => void;
}

export function BulkTest({ apiKey, onNeedKey, onTickets }: Props) {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [addToQueues, setAddToQueues] = useState(true);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const onFile = async (file: File) => {
    const text = await file.text();
    const list = complaintsFromCsv(text);
    if (!list.length) {
      toast.error("No complaints found in that CSV");
      return;
    }
    setInput(list.join("\n"));
    toast.success(`Loaded ${list.length} complaints from ${file.name}`);
  };

  const run = async () => {
    if (!apiKey) {
      onNeedKey();
      return;
    }
    if (!lines.length) {
      toast.error("Paste at least one complaint");
      return;
    }
    stopRef.current = false;
    setRunning(true);
    setRows([]);
    setDone(0);
    setRetryNote(null);
    setTotal(lines.length);
    const out: Row[] = [];
    const newTickets: Ticket[] = [];

    for (const text of lines) {
      if (stopRef.current) break;
      let row: Row;
      try {
        const result = await classifyComplaint(text, apiKey, {
          onRetry: (attempt) => setRetryNote(`Groq is busy — retrying (${attempt}/${MAX_RETRIES})`),
        });
        row = { text, result };
        newTickets.push({
          id: crypto.randomUUID(),
          text,
          createdAt: Date.now(),
          classification: result.classification,
          department: result.classification.department,
          status: routeStatus(result.classification.confidence),
          latencyMs: result.latencyMs,
          promptTokens: result.promptTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          costInr: result.costInr,
        });
      } catch (e) {
        row = { text, error: e instanceof Error ? e.message : "Failed" };
        if (e instanceof GroqError && (e.status === 401 || e.status === 403)) {
          out.push(row);
          setRows([...out]);
          toast.error(row.error);
          break;
        }
      }
      out.push(row);
      setRows([...out]);
      setDone(out.length);
      setRetryNote(null);
    }

    if (addToQueues && newTickets.length) onTickets(newTickets.reverse());
    setRunning(false);
    toast.success(`Processed ${out.length} complaint${out.length === 1 ? "" : "s"}`);
  };

  const ok = rows.filter((r) => r.result);
  const avg = ok.length ? ok.reduce((s, r) => s + r.result!.latencyMs, 0) / ok.length : 0;
  const usd = ok.reduce((s, r) => s + r.result!.costUsd, 0);
  const inr = ok.reduce((s, r) => s + r.result!.costInr, 0);

  const exportCsv = () => {
    const data = [
      ["Complaint", "Department", "Block", "Floor", "Room", "Urgency", "Confidence", "Routed To", "Reason", "Latency (ms)", "Cost (USD)", "Cost (INR)", "Error"],
      ...rows.map((r) => {
        const c = r.result?.classification;
        return [
          r.text,
          c?.department ?? "",
          c?.location.block ?? "",
          c?.location.floor ?? "",
          c?.location.room ?? "",
          c?.urgency ?? "",
          c?.confidence ?? "",
          c ? (routeStatus(c.confidence) === "review" ? "Human Review" : c.department) : "",
          c?.reason ?? "",
          r.result ? Math.round(r.result.latencyMs) : "",
          r.result ? r.result.costUsd.toFixed(8) : "",
          r.result ? r.result.costInr.toFixed(6) : "",
          r.error ?? "",
        ];
      }),
    ];
    const blob = new Blob(["\uFEFF" + toCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campusfix-bulk-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Bulk test</h2>
            <p className="text-sm text-muted-foreground">One complaint per line, or upload a .csv.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setInput(BULK_SAMPLES.join("\n"))} disabled={running}>
              <Wand2 /> Load 8 samples
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={running}>
              <FileUp /> Upload CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={"bhai tap leak kar rha h\nveere room 304 ch pankha nahi chal reha\n…"}
          className="mt-4 min-h-40 bg-background font-mono text-sm"
          disabled={running}
        />

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Switch id="add-q" checked={addToQueues} onCheckedChange={setAddToQueues} disabled={running} />
            <Label htmlFor="add-q" className="text-sm text-muted-foreground">
              Also add results to ticket queues
            </Label>
          </div>
          {running ? (
            <Button variant="destructive" onClick={() => (stopRef.current = true)}>
              <Square /> Stop
            </Button>
          ) : (
            <Button variant="hero" onClick={run} disabled={!lines.length}>
              <Play /> Run {lines.length || ""} complaint{lines.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>

        {total > 0 && (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                {running && <Loader2 className="size-3.5 animate-spin" />}
                {done} / {total} processed
              </span>
              <span className="font-mono">{pct}%</span>
            </div>
            <Progress value={pct} className="h-2.5" />
            {retryNote && <p className="text-xs font-medium text-review">{retryNote}</p>}
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className="rounded-2xl border bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>
                OK <b className="text-foreground">{ok.length}</b>/{rows.length}
              </span>
              <span>
                Avg <b className="text-foreground">{fmtMs(avg)}</b>
              </span>
              <span>
                Total <b className="text-foreground">{fmtUsd(usd, 5)}</b> · {fmtInr(inr, 3)}
              </span>
            </div>
            <Button variant="accent" size="sm" onClick={exportCsv} disabled={running}>
              <Download /> Export CSV
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2.5 font-medium">#</th>
                  <th className="px-3 py-2.5 font-medium">Complaint</th>
                  <th className="px-3 py-2.5 font-medium">Department</th>
                  <th className="px-3 py-2.5 font-medium">Location</th>
                  <th className="px-3 py-2.5 font-medium">Urgency</th>
                  <th className="px-3 py-2.5 font-medium">Confidence</th>
                  <th className="px-3 py-2.5 text-right font-medium">Latency</th>
                  <th className="px-3 py-2.5 text-right font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = r.result?.classification;
                  return (
                    <tr key={i} className="border-t align-top">
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                      <td className="max-w-64 px-3 py-2.5">{r.text}</td>
                      {c && r.result ? (
                        <>
                          <td className="px-3 py-2.5">
                            <DeptBadge department={c.department} />
                            {routeStatus(c.confidence) === "review" && (
                              <div className="mt-1 text-[11px] font-medium text-review">→ Human review</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-xs">{formatLocation(c.location)}</td>
                          <td className="px-3 py-2.5">
                            <UrgencyBadge urgency={c.urgency} />
                          </td>
                          <td className="px-3 py-2.5">
                            <ConfidenceBadge confidence={c.confidence} />
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtMs(r.result.latencyMs)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs">
                            {fmtUsd(r.result.costUsd)}
                            <div className="text-muted-foreground">{fmtInr(r.result.costInr)}</div>
                          </td>
                        </>
                      ) : (
                        <td colSpan={6} className="px-3 py-2.5 text-xs text-destructive">
                          {r.error}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
