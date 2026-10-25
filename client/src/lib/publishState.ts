// How each publish state reads in the UI (chip text and colors).
export const STATE_LABEL: Record<string, { text: string; cls: string }> = {
  new: { text: "Not in OrcaSlicer", cls: "border-sky-500/50 bg-sky-500/15 text-sky-300 day:text-sky-800" },
  changes: { text: "Changes", cls: "border-accent-500/50 bg-accent-500/15 text-accent-300" },
  current: { text: "Up to date", cls: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 day:text-emerald-800" },
  blocked: { text: "Blocked", cls: "border-rose-500/50 bg-rose-500/15 text-rose-300 day:text-rose-800" },
};
