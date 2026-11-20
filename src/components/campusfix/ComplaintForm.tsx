import { useState } from "react";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export const SAMPLES = [
  { label: "Leaking tap", text: "bhai 4th floor ka washroom ka tap 3 din se leak kar rha h" },
  { label: "Fan (Punjabi)", text: "veere BH-2 de room 304 ch pankha nahi chal reha" },
  { label: "Mess food", text: "mess ki daal mein aaj phir keeda nikla yaar, koi dhyan hi nahi deta" },
  { label: "Vague one", text: "sir kal se kuch bhi theek nahi chal raha, please koi aake dekh lo" },
];

interface Props {
  onSubmit: (text: string) => Promise<boolean>;
  busy: boolean;
}

export function ComplaintForm({ onSubmit, busy }: Props) {
  const [text, setText] = useState("");

  const submit = async () => {
    if (!text.trim() || busy) return;
    const ok = await onSubmit(text.trim());
    if (ok) setText("");
  };

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-card">
      <h2 className="text-lg font-bold">Raise a complaint</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        English, Hinglish or Romanised Punjabi — likho jaise bolte ho.
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        placeholder="e.g. bhai 4th floor ka washroom ka tap 3 din se leak kar rha h"
        className="mt-4 min-h-32 resize-none bg-background text-base"
        maxLength={1000}
      />

      <div className="mt-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Sparkles className="size-3.5" /> Try a sample
        </p>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.text)}
              title={s.text}
              className="rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Button variant="hero" size="lg" className="mt-5 w-full" onClick={submit} disabled={busy || !text.trim()}>
        {busy ? <Loader2 className="animate-spin" /> : <Send />}
        {busy ? "Routing with Groq…" : "Classify & route"}
      </Button>
    </section>
  );
}
