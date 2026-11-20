import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FlaskConical, Inbox, KeyRound, LayoutGrid, Settings, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { BulkTest } from "@/components/campusfix/BulkTest";
import { ComplaintForm } from "@/components/campusfix/ComplaintForm";
import { DEPT_ICON, ReviewIcon } from "@/components/campusfix/meta";
import { SettingsDialog } from "@/components/campusfix/SettingsDialog";
import { SummaryCards } from "@/components/campusfix/SummaryCards";
import { TicketCard } from "@/components/campusfix/TicketCard";
import { useGroqKey, useGroqModel, useTickets } from "@/hooks/use-campusfix";
import { DEPARTMENTS, MAX_RETRIES, routeStatus, type Department, type Ticket } from "@/lib/campusfix";
import { classifyComplaint, GROQ_MODEL, GroqError } from "@/lib/groq";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CampusFix AI — Hinglish Complaint Router" },
      {
        name: "description",
        content:
          "Route messy English, Hinglish and Punjabi campus complaints to the right department with Llama 3.3 on Groq — with live cost and latency.",
      },
      { property: "og:title", content: "CampusFix AI — Hinglish Complaint Router" },
      {
        property: "og:description",
        content: "AI routing for campus complaints in English, Hinglish and Romanised Punjabi.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "all" | "review" | Department | "bulk";

function Index() {
  const { tickets, loaded, add, approve, remove, clear } = useTickets();
  const { apiKey, envKey, saved, source, save } = useGroqKey();
  const { model, models, loading: loadingModels, refresh: refreshModels, ensure: ensureModel } = useGroqModel();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [busy, setBusy] = useState(false);

  const needKey = () => {
    toast.error("Add your Groq API key first");
    setSettingsOpen(true);
  };

  const handleSubmit = async (text: string) => {
    if (!apiKey) {
      needKey();
      return false;
    }
    setBusy(true);
    try {
      const chosen = await ensureModel(apiKey);
      const r = await classifyComplaint(text, apiKey, {
        model: chosen,
        onRetry: (attempt) => toast.info(`Groq is busy — retrying (${attempt}/${MAX_RETRIES})`),
      });
      const status = routeStatus(r.classification.confidence);
      const ticket: Ticket = {
        id: crypto.randomUUID(),
        text,
        createdAt: Date.now(),
        classification: r.classification,
        department: r.classification.department,
        status,
        latencyMs: r.latencyMs,
        promptTokens: r.promptTokens,
        outputTokens: r.outputTokens,
        costUsd: r.costUsd,
        costInr: r.costInr,
      };
      add(ticket);
      if (status === "review") {
        toast.warning(`Low confidence (${r.classification.confidence}%) — sent to Human Review`);
        setTab((t) => (t === "bulk" ? t : "review"));
      } else {
        toast.success(`Routed to ${r.classification.department} · ${Math.round(r.latencyMs)} ms`);
        setTab((t) => (t === "all" || t === "bulk" ? t : r.classification.department));
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Something went wrong";
      toast.error(msg);
      if (e instanceof GroqError && (e.status === 401 || e.status === 403)) {
        setSettingsOpen(true);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const isAuthError = (e: unknown) => e instanceof GroqError && (e.status === 401 || e.status === 403);

  const loadModels = async (key: string, preferred: string) => {
    const k = key.trim() || apiKey;
    if (!k) return null;
    try {
      return await refreshModels(k, preferred);
    } catch (e) {
      toast.error(
        isAuthError(e)
          ? "Groq rejected this key — check it and try again"
          : `Couldn't load Groq models: ${e instanceof Error ? e.message : "unknown error"}`,
      );
      return null;
    }
  };

  const handleSaveSettings = async (key: string, preferred: string) => {
    save(key);
    const k = key.trim() || envKey;
    if (!k) {
      toast("No API key saved");
      return true;
    }
    try {
      const picked = await refreshModels(k, preferred || model);
      toast.success(`API key saved · using ${picked}`);
      return true;
    } catch (e) {
      if (isAuthError(e)) {
        toast.error("Groq rejected this key — check it and try again");
        return false;
      }
      toast.warning(`Key saved, but the model list didn't load. Using ${model || GROQ_MODEL} for now.`);
      return true;
    }
  };

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: tickets.length, review: 0 };
    for (const d of DEPARTMENTS) m[d] = 0;
    for (const t of tickets) {
      if (t.status === "review") m["review"]!++;
      else m[t.department] = (m[t.department] ?? 0) + 1;
    }
    return m;
  }, [tickets]);

  const visible = useMemo(() => {
    if (tab === "all") return tickets;
    if (tab === "review") return tickets.filter((t) => t.status === "review");
    return tickets.filter((t) => t.status !== "review" && t.department === tab);
  }, [tickets, tab]);

  const tabs: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: "all", label: "All Tickets", icon: LayoutGrid },
    { id: "review", label: "Human Review", icon: ReviewIcon },
    ...DEPARTMENTS.map((d) => ({ id: d as Tab, label: d, icon: DEPT_ICON[d] })),
    { id: "bulk", label: "Bulk Test", icon: FlaskConical },
  ];

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="size-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-base font-extrabold">
              CampusFix <span className="text-primary">AI</span>
            </div>
            <div className="hidden text-[11px] text-muted-foreground sm:block">Hinglish Complaint Router</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" disabled={!tickets.length}>
                  <Trash2 /> <span className="hidden sm:inline">Clear all</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all {tickets.length} tickets?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes every ticket saved in this browser. It can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      clear();
                      toast("All tickets cleared");
                    }}
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} aria-label="API key settings">
              <span
                className={cn("size-2 rounded-full", source === "none" ? "bg-destructive" : "bg-low")}
                aria-hidden
              />
              <Settings /> <span className="hidden sm:inline">API key</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5">
        {/* Hero band */}
        <section className="bg-dots relative overflow-hidden rounded-3xl bg-ink p-6 text-ink-foreground sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Live routing on Groq{model ? ` · ${model}` : ""}</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-extrabold leading-[1.05] sm:text-4xl">
            “Tap leak kar rha h” → <span className="text-accent">Plumbing, 4th floor, Medium.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-foreground/70">
            Messy complaints in English, Hinglish or Punjabi get sorted into the right queue in milliseconds. Unsure
            ones go to a human first.
          </p>
          {source === "none" && (
            <Button variant="accent" className="mt-5" onClick={() => setSettingsOpen(true)}>
              <KeyRound /> Add Groq API key to start
            </Button>
          )}
        </section>

        <SummaryCards tickets={tickets} />

        <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ComplaintForm onSubmit={handleSubmit} busy={busy} />
          </div>

          <div className="min-w-0 space-y-4">
            <nav className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              {tabs.map((t) => {
                const active = tab === t.id;
                const count = t.id === "bulk" ? null : counts[t.id];
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-card text-foreground hover:border-primary/40",
                      !active && t.id === "review" && counts["review"] ? "border-review/40 text-review" : "",
                    )}
                  >
                    <t.icon className="size-3.5" />
                    {t.label}
                    {count !== null && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 font-mono text-[11px]",
                          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                        )}
                      >
                        {count ?? 0}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {tab === "bulk" ? (
              <BulkTest apiKey={apiKey} getModel={ensureModel} onNeedKey={needKey} onTickets={add} />
            ) : !loaded ? null : visible.length === 0 ? (
              <EmptyState tab={tab} />
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {visible.map((t) => (
                  <TicketCard
                    key={t.id}
                    ticket={t}
                    onApprove={(id, d) => {
                      approve(id, d);
                      toast.success(`Approved and sent to ${d}`);
                    }}
                    onRemove={remove}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        saved={saved}
        source={source}
        model={model}
        models={models}
        loadingModels={loadingModels}
        onSave={handleSaveSettings}
        onRemoveKey={() => {
          save("");
          toast("Saved key removed");
        }}
        onRefreshModels={loadModels}
      />
    </div>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg =
    tab === "review"
      ? "No tickets waiting for review. Anything under 75% confidence lands here."
      : tab === "all"
        ? "No tickets yet. Try one of the sample complaints."
        : `No ${tab} tickets yet.`;
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center">
      <Inbox className="size-8 text-muted-foreground" />
      <p className="mt-3 max-w-xs text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
