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
  replaces?: { fileName: string; kind: StrayKind; owner?: string };
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

const REPLACES_WHOSE: Record<StrayKind, string> = { spoolman2slicer: "spoolman2slicer's", yours: "your", spoolkeeper: "this filament's other-scope" };

/** One line on what publishing does to an older same-named preset, if anything. */
export const replacesNote = (p: PublishPlan) =>
  p.replaces ? `Takes the place of ${REPLACES_WHOSE[p.replaces.kind]} "${p.replaces.fileName.replace(/\.json$/, "")}" (backed up first).` : null;

export const publish = (items: PublishItem[]) =>
  request<{ results: PublishResult[]; restartNote: string }>("/api/publish", { method: "POST", body: JSON.stringify({ items }) });

/** spoolman2slicer's generated presets, ones you made yourself, and Spoolkeeper's own that are no longer current. */
export type StrayKind = "spoolman2slicer" | "yours" | "spoolkeeper";

export interface StrayFile {
  fileName: string;
  name: string;
  kind: StrayKind;
  owner: string | null;
  inherits: string | null;
  /** Why a Spoolkeeper preset is no longer current. */
  reason: string | null;
  productId: number | null;
  /** Other presets built on this one - it can only go along with them. */
  inheritedBy: string[];
  values: Record<string, string>;
  spoolIds: number[];
  /** A current Spoolkeeper preset for the same filament is in OrcaSlicer. */
  replaced: boolean;
}

export const fetchStrays = () => request<{ writable: Writable; strays: StrayFile[] }>("/api/publish/strays");

export const removeStrays = (files: string[]) =>
  request<{ removed: string[]; backupDir: string; restartNote: string }>("/api/publish/strays/remove", { method: "POST", body: JSON.stringify({ files }) });
