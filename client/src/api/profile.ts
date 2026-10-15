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
  profile: { name: string; fileName: string; inherits: string; baseFallback: boolean; compatiblePrinters: string[] };
  values: ProfileValue[];
  pending: { key: string; why: string }[];
  orca: { json: Record<string, unknown>; info: string };
}

export const fetchSpoolProfile = (id: number, scope: ProfileScope) => request<SpoolProfile>(`/api/spools/${id}/profile?scope=${scope}`);

export const profileJsonUrl = (id: number, scope: ProfileScope) => `/api/spools/${id}/profile/orca.json?scope=${scope}`;

export interface Settings {
  printerProfile: string;
  orcaUserDir: string;
}

export const fetchSettings = () => request<Settings>("/api/settings");

export const saveSettings = (patch: Partial<Settings>) => request<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(patch) });
