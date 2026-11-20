import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pickBestModel } from "@/lib/campusfix";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  saved: string;
  source: "saved" | "env" | "none";
  model: string;
  models: string[];
  loadingModels: boolean;
  /** Saves the key and model; resolves false when the dialog should stay open. */
  onSave: (key: string, model: string) => Promise<boolean>;
  onRemoveKey: () => void;
  /** Reloads the live model list with `key` (empty = the key currently in use). */
  onRefreshModels: (key: string, preferred: string) => Promise<string | null>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  saved,
  source,
  model,
  models,
  loadingModels,
  onSave,
  onRemoveKey,
  onRefreshModels,
}: Props) {
  const [value, setValue] = useState(saved);
  const [selected, setSelected] = useState(model);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasKey = !!value.trim() || source !== "none";
  const best = useMemo(() => pickBestModel(models), [models]);
  const sorted = useMemo(() => [...models].sort((a, b) => a.localeCompare(b)), [models]);

  useEffect(() => {
    if (open) setValue(saved);
  }, [open, saved]);

  useEffect(() => {
    if (open) setSelected(model);
  }, [open, model]);

  // First time the dialog opens with a usable key, load the live list.
  useEffect(() => {
    if (open && !models.length && source !== "none" && !loadingModels) void onRefreshModels("", model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <KeyRound className="size-5 text-primary" /> Groq API settings
          </DialogTitle>
          <DialogDescription>Your key and model choice stay in this browser only.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="groq-key">Groq API key</Label>
          <div className="relative">
            <Input
              id="groq-key"
              type={show ? "text" : "password"}
              placeholder="gsk_…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="pr-10 font-mono"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              aria-label={show ? "Hide key" : "Show key"}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {source === "env" && !value
              ? "Currently using the VITE_GROQ_API_KEY from the environment."
              : "Get a free key at console.groq.com/keys."}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="groq-model">Model</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={!hasKey || loadingModels}
              onClick={() => void onRefreshModels(value, selected)}
            >
              <RefreshCw className={cn("size-3.5", loadingModels && "animate-spin")} /> Refresh list
            </Button>
          </div>
          <Select value={selected} onValueChange={setSelected} disabled={!models.length || loadingModels}>
            <SelectTrigger id="groq-model" className="font-mono text-xs" aria-label="Model">
              <SelectValue
                placeholder={
                  loadingModels ? "Loading live models…" : hasKey ? "Save your key to load models" : "Add a key to load models"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {sorted.map((id) => (
                <SelectItem key={id} value={id} className="font-mono text-xs">
                  {id}
                  {id === best && (
                    <span className="ml-2 rounded bg-accent/40 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-accent-foreground">
                      best pick
                    </span>
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {models.length
              ? `${models.length} live chat models. The best one is picked for you; switch anytime.`
              : "Speech, safety and embedding models are left out automatically."}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {saved && (
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => {
                onRemoveKey();
                onOpenChange(false);
              }}
            >
              Remove key
            </Button>
          )}
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              const ok = await onSave(value, selected);
              setSaving(false);
              if (ok) onOpenChange(false);
            }}
          >
            {saving && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
