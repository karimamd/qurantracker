export type Quality = "excellent" | "good" | "hard" | "relearn";

export interface QualityDef {
  value: Quality;
  label: string;
  short: string;
  completed: boolean;
}

export const QUALITIES: QualityDef[] = [
  { value: "excellent", label: "Excellent", short: "Exc",  completed: true  },
  { value: "good",      label: "Good",      short: "Good", completed: true  },
  { value: "hard",      label: "Hard",      short: "Hard", completed: false },
  { value: "relearn",   label: "Relearn",   short: "Re",   completed: false },
];

// Quality palette is intentionally constrained to four warm/natural hues that
// harmonize with the Reader's parchment surface (#f4ecd8):
//   excellent → emerald   good → teal   hard → amber   relearn → rose
// "good" deliberately uses teal (the app's primary) rather than a cool sky
// blue so the dashboard feels like a continuous extension of the brand.
export const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good:      { active: "bg-teal-600 border-teal-600 text-white",       hover: "hover:border-teal-300 hover:text-teal-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-300 hover:text-rose-700" },
};

// `dotStyle` and `rowStyle` deliberately collapse on a "completed vs not"
// axis (emerald = both excellent + good; amber = both hard + relearn). This
// is the at-a-glance row indicator on dense lists where finer distinction
// would add noise; the explicit quality is still shown via QualityBadge and
// the per-quality button color (`qualityStyle` above, where good = teal).
export const dotStyle: Record<Quality, string> = {
  excellent: "border-emerald-500 bg-emerald-500",
  good:      "border-emerald-500 bg-emerald-500",
  hard:      "border-amber-400 bg-amber-400",
  relearn:   "border-amber-400 bg-amber-400",
};

export const rowStyle: Record<Quality, string> = {
  excellent: "bg-emerald-50/60",
  good:      "bg-emerald-50/60",
  hard:      "bg-amber-50/40",
  relearn:   "bg-amber-50/40",
};

export function getStatusBgClass(status: string): string {
  switch (status) {
    case "overdue":     return "bg-rose-50 border-rose-200";
    case "due_soon":    return "bg-amber-50 border-amber-200";
    case "on_track":    return "bg-emerald-50 border-emerald-200";
    case "not_started": return "bg-stone-50 border-stone-200";
    default:            return "bg-muted/50 border-border";
  }
}

export function getStatusBarColor(status: string): string {
  switch (status) {
    case "overdue":     return "bg-rose-500";
    case "due_soon":    return "bg-amber-400";
    case "on_track":    return "bg-emerald-500";
    case "not_started": return "bg-stone-400";
    default:            return "bg-stone-300";
  }
}

export function isCompletedQuality(q: string | null | undefined): boolean {
  return q === "excellent" || q === "good";
}
