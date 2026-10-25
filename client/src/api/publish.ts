import { request } from "./client";
import type { ProfileScope } from "./profile";

export interface KeyChange {
  key: string;
  current: string | null;
  /** null = Spoolkeeper no longer sets it; it's removed and the base profile's value applies. */
  proposed: string | null;
  /** Changed in OrcaSlicer since Spoolkeeper wrote it - kept unless overwritten. */
  handTuned: boolean;
  lastWritten?: string | null;
}

export type PlanState = "new" | "changes" | "current" | "blocked";

export interface PublishPlan {
  owner: string;
  scope: ProfileScope;
  spoolId: number | null;
  productId: number;
  name: string;
  fileName: string;
  existingFile: string | null;
  state: PlanState;
  blockedReason?: string;
  /** Blocked only by a preset you made yourself; publishing with `replace` takes its place (backed up). */
  replaceable?: boolean;
  /** An older same-named preset this one takes the place of (backed up first). */
  replaces?: { fileName: string; kind: "spoolman2slicer" | "yours" };
  changes: KeyChange[];
  publishedAt: string | null;
}

export interface PublishListItem extends PublishPlan {
  spoolIds: number[];
  colorHex: string | null;
  material: string;
}

export interface Writable {
  ok: boolean;
  reason?: string;
}

export interface PublishResult {
  owner: string;
  name: string;
  fileName: string;
  action: "created" | "updated" | "renamed" | "replaced" | "unchanged" | "blocked";
  kept: string[];
  backupDir: string | null;
  error?: string;
}

export interface PublishItem {
  spoolId: number;
  scope: ProfileScope;
  overwrite?: string[];
  replace?: boolean;
}

export const fetchPublishList = (scope: ProfileScope) =>
  request<{ dir: string; writable: Writable; restartNote: string; scope: ProfileScope; items: PublishListItem[] }>(`/api/publish?scope=${scope}`);

export const fetchPublishPlan = (spoolId: number, scope: ProfileScope) =>
  request<{ writable: Writable; restartNote: string; plan: PublishPlan }>(`/api/publish/spools/${spoolId}?scope=${scope}`);

/** One line on what publishing does to an older same-named preset, if anything. */
export const replacesNote = (p: PublishPlan) =>
  p.replaces
    ? `Takes the place of ${p.replaces.kind === "spoolman2slicer" ? "spoolman2slicer's" : "your"} "${p.replaces.fileName.replace(/\.json$/, "")}" (backed up first).`
    : null;

export const publish = (items: PublishItem[]) =>
  request<{ results: PublishResult[]; restartNote: string }>("/api/publish", { method: "POST", body: JSON.stringify({ items }) });

export interface LegacyFile {
  fileName: string;
  name: string;
  inherits: string | null;
  productId: number | null;
  spoolIds: number[];
  /** A Spoolkeeper preset for the same filament is in OrcaSlicer. */
  replaced: boolean;
}

export const fetchLegacy = () => request<{ writable: Writable; legacy: LegacyFile[] }>("/api/publish/legacy");

export const removeLegacy = (files: string[]) =>
  request<{ removed: string[]; backupDir: string; restartNote: string }>("/api/publish/legacy/remove", { method: "POST", body: JSON.stringify({ files }) });
