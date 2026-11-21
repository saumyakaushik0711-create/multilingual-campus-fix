import { useState } from "react";
import { Loader2, LogOut, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: { id: string; email: string } | null;
  isStaff: boolean;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
  onSignOut: () => Promise<void>;
}

export function StaffDialog({
  open,
  onOpenChange,
  user,
  isStaff,
  onSignIn,
  onSignUp,
  onSignOut,
}: Props) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || password.length < 6) {
      toast.error("Enter your email and a password of at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      if (mode === "in") {
        await onSignIn(email, password);
        toast.success("Signed in");
      } else {
        const needsConfirm = await onSignUp(email, password);
        toast.success(
          needsConfirm ? "Check your email to confirm your account" : "Account created",
        );
      }
      setPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Staff access</DialogTitle>
          <DialogDescription>
            Students can report complaints without signing in. Approving, reassigning and deleting
            tickets is for campus staff only.
          </DialogDescription>
        </DialogHeader>

        {user ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
              {isStaff ? (
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-low" />
              ) : (
                <ShieldAlert className="mt-0.5 size-5 shrink-0 text-review" />
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{user.email}</div>
                <div className="text-muted-foreground">
                  {isStaff
                    ? "Staff access is on — you can approve and delete tickets."
                    : "This account doesn't have staff access yet. Ask the project owner to turn it on."}
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                void onSignOut().then(() => toast("Signed out"));
              }}
            >
              <LogOut /> Sign out
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={255}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="staff-password">Password</Label>
              <Input
                id="staff-password"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={128}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />}
              {mode === "in" ? "Sign in" : "Create staff account"}
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setMode(mode === "in" ? "up" : "in")}
            >
              {mode === "in"
                ? "New staff member? Create an account"
                : "Already have an account? Sign in"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
