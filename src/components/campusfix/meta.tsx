import { CircleHelp, Droplets, GraduationCap, UserCheck, UtensilsCrossed, Wifi, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Department, Urgency } from "@/lib/campusfix";
import { CONFIDENCE_THRESHOLD } from "@/lib/campusfix";

export const DEPT_ICON: Record<Department, typeof Zap> = {
  Plumbing: Droplets,
  Electrical: Zap,
  "Wi-Fi": Wifi,
  Mess: UtensilsCrossed,
  Academic: GraduationCap,
  Other: CircleHelp,
};
export const ReviewIcon = UserCheck;

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const variant = urgency === "High" ? "high" : urgency === "Medium" ? "medium" : "low";
  return (
    <Badge variant={variant} className="gap-1.5">
      <span className="size-1.5 rounded-full bg-current" />
      {urgency}
    </Badge>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const variant = confidence >= 85 ? "low" : confidence >= CONFIDENCE_THRESHOLD ? "medium" : "high";
  return (
    <Badge variant={variant} className="font-mono tabular-nums">
      {confidence}% conf
    </Badge>
  );
}

export function DeptBadge({ department }: { department: Department }) {
  const Icon = DEPT_ICON[department];
  return (
    <Badge variant="dept" className="gap-1">
      <Icon className="size-3" />
      {department}
    </Badge>
  );
}
