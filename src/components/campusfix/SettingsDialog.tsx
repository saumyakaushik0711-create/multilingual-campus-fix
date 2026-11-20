import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toast } from "sonner";
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
import { GROQ_MODEL } from "@/lib/groq";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  saved: string;
  source: "saved" | "env" | "none";
  onSave: (key: string) => void;
}

export function SettingsDialog({ open, onOpenChange, saved, source, onSave }: Props) {
  const [value, setValue] = useState(saved);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) setValue(saved);
  }, [open, saved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <KeyRound className="size-5 text-primary" /> Groq API settings
          </DialogTitle>
          <DialogDescription>
            Your key stays in this browser only. Model: <span className="font-mono">{GROQ_MODEL}</span>
          </DialogDescription>
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

        <DialogFooter className="gap-2 sm:gap-2">
          {saved && (
            <Button
              variant="ghost"
              onClick={() => {
                onSave("");
                toast("Saved key removed");
                onOpenChange(false);
              }}
            >
              Remove key
            </Button>
          )}
          <Button
            onClick={() => {
              onSave(value);
              toast.success(value.trim() ? "API key saved" : "Using environment key");
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
