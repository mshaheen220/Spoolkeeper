import type { Source } from "../types";
import { request } from "./client";

export type ProfileScope = "spool" | "product";

export interface ProfileValue {
  key: string;
  value: string;
  source: Source | "calibration" | "spoolkeeper";
  sourceRef?: string | null;
  why: string;
}

export interface SpoolProfile {
  spoolId: number;
  productId: number;
  scope: ProfileScope;
  profile: { name: string; fileName: string; inherits: string; baseFallback: boolean; tunedOn: string[]; orcaVersion: string | null };
  tunedFromSpool: number | null;
  values: ProfileValue[];
  pending: { key: string; why: string }[];
  orca: { json: Record<string, unknown>; info: string };
}

export const fetchSpoolProfile = (id: number, scope: ProfileScope) => request<SpoolProfile>(`/api/spools/${id}/profile?scope=${scope}`);

export const profileJsonUrl = (id: number, scope: ProfileScope) => `/api/spools/${id}/profile/orca.json?scope=${scope}`;

export interface EstepsCheck {
  current: number;
  markMm: number;
  extrudeMm: number;
  remainingMm: number;
  extrudedMm: number;
  suggested: number;
  checkedAt: string;
}

export interface Settings {
  printerProfile: string;
  orcaUserDir: string;
  linearAdvance: "unknown" | "supported" | "unsupported";
  esteps: EstepsCheck | null;
  label: { widthMm: number; heightMm: number };
  publicBaseUrl: string;
}

export interface OrcaPrinter {
  name: string;
  inherits: string | null;
  nozzleDiameter: number | null;
}

/** Printer presets in OrcaSlicer's user folder. */
export const fetchPrinters = () => request<{ printers: OrcaPrinter[]; error?: string }>("/api/orca/printers");

export const fetchSettings = () => request<Settings>("/api/settings");

export const checkEsteps = (body: { current: number; remainingMm: number; markMm?: number; extrudeMm?: number }) =>
  request<Settings>("/api/settings/esteps", { method: "POST", body: JSON.stringify(body) });

export const saveSettings = (patch: Partial<Settings>) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
