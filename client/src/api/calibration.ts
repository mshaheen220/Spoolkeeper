import type { Product } from "../types";
import { request } from "./client";

export type TestId = "temp" | "mvs" | "pa" | "flow1" | "flow2" | "flow_yolo" | "retraction" | "cooling";
export type StepId = "temp" | "mvs" | "pa" | "flow" | "retraction" | "cooling";
export type LinearAdvance = "unknown" | "supported" | "unsupported";

/** A short action headline, with an optional explanation shown on request. */
export interface Hint {
  title: string;
  detail?: string;
}

export interface InputField {
  key: string;
  label: string;
  type: "number" | "select" | "text" | "boolean";
  unit?: string;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
  optional?: boolean;
  readOnly?: boolean;
  fromProfile?: boolean;
}

export interface TestInfo {
  id: TestId;
  step: StepId;
  title: string;
  optional: boolean;
  why: string;
  orcaMenu: string[];
  /** What OrcaSlicer forces for this test, so the presets' values don't matter there. */
  orcaSets: string | null;
  /** Preset settings OrcaSlicer leaves alone that can spoil this test. */
  checks: Hint[];
  instructions: Hint[];
  /** What to look and listen for while it prints, and how to read the finished test. */
  watch: { during: Hint[]; after: Hint[] } | null;
  params: InputField[];
  observation: InputField[];
  suggestedParams: Record<string, string | number | boolean>;
  suggestedObservation: Record<string, string | number | boolean>;
  /** Where each prefilled observation came from. */
  suggestionNotes: Record<string, string>;
  /** Prefilled observations are a complete answer to confirm as-is. */
  prefillIsAnswer: boolean;
  skipped: boolean;
}

export interface ResultValue {
  key: string;
  value: string;
  label: string;
}

export interface CalibrationRun {
  id: number;
  spoolId: number;
  test: TestId;
  params: Record<string, unknown>;
  observation: Record<string, unknown>;
  result: ResultValue[];
  formula: string[];
  accepted: boolean;
  notes: string | null;
  createdAt: string;
  printerProfile: string | null;
  nozzleDiameter: number | null;
  /** Set when the run was copied from another filament's calibration. */
  copiedFrom: { runId: number; spoolId: number; name: string } | null;
}

export interface CopyTarget {
  productId: number;
  displayName: string;
  colorHex: string | null;
  colorHexes: string[] | null;
  multiColorDirection: Product["multiColorDirection"];
  spoolId: number;
  /** Why it may print differently - each one unticks it by default. */
  differences: string[];
  /** Steps it already has its own results for. */
  calibratedSteps: StepId[];
}

export interface TunedValue extends ResultValue {
  runId: number;
  test: TestId;
  date: string;
}

export interface BaselineValue extends TunedValue {
  baseline: { spoolId: number; name: string; material: string };
}

/** What the material's baseline spool does for this filament. */
export interface BaselineStatus {
  material: string;
  source: { spoolId: number; name: string } | null;
  /** This filament is the baseline. */
  isSource: boolean;
  used: boolean;
  notes: string[];
  /** true = always, false = never, null = decided by finish. */
  override: boolean | null;
  /** Values taken from the baseline: only ones this filament hasn't tuned itself. */
  values: BaselineValue[];
}

export interface BaselineCoverage {
  productId: number;
  spoolId: number;
  displayName: string;
  colorHex: string | null;
  finishes: string[] | null;
  used: boolean;
  notes: string[];
  override: boolean | null;
  keys: string[];
  ownKeys: string[];
}

export interface MaterialBaseline {
  material: string;
  source: { spoolId: number; name: string; tuned: Record<string, TunedValue> } | null;
  filaments: BaselineCoverage[];
}

export interface CalibrationState {
  spoolId: number;
  product: Product;
  linearAdvance: LinearAdvance;
  calibratingOn: { name: string; nozzleDiameter: number | null };
  plateType: { label: string; side: "smooth" | "textured" | "other"; perPrinter: boolean } | null;
  /** Preset settings to check before any test print. */
  setupChecks: Hint[];
  /** Other filaments of the same brand and material this calibration can be copied to. */
  copyTargets: CopyTarget[];
  tests: TestInfo[];
  runs: CalibrationRun[];
  tuned: Record<string, TunedValue>;
  baseline: BaselineStatus;
  baseDefaults: Record<string, string>;
  siblings: { spoolId: number; archived: boolean; tuned: Record<string, TunedValue> }[];
}

export interface Computed {
  values: ResultValue[];
  formula: string[];
  warnings: string[];
}

type Body = { test: TestId; params: Record<string, unknown>; observation: Record<string, unknown>; notes?: string | null };

export const fetchCalibration = (spoolId: number) => request<CalibrationState>(`/api/spools/${spoolId}/calibration`);

export const previewRun = (spoolId: number, body: Body) =>
  request<Computed>(`/api/spools/${spoolId}/calibration/preview`, { method: "POST", body: JSON.stringify(body) });

export const saveRun = (spoolId: number, body: Body) =>
  request<{ run: CalibrationRun; warnings: string[] }>(`/api/spools/${spoolId}/calibration/runs`, { method: "POST", body: JSON.stringify(body) });

export const copyCalibration = (spoolId: number, body: { productIds: number[]; steps: StepId[] }) =>
  request<{ copied: { productId: number; spoolId: number; runs: number }[] }>(`/api/spools/${spoolId}/calibration/copy`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const setRunAccepted = (runId: number, accepted: boolean) =>
  request<{ run: CalibrationRun }>(`/api/calibration/runs/${runId}`, { method: "PATCH", body: JSON.stringify({ accepted }) });

export const fetchBaselines = () => request<{ baselines: MaterialBaseline[] }>("/api/calibration/baselines");

/** Make this spool's results its material's baseline, or stop. */
export const setBaseline = (spoolId: number, use: boolean) =>
  request<{ baseline: BaselineStatus }>(`/api/spools/${spoolId}/calibration/baseline`, { method: "PUT", body: JSON.stringify({ use }) });

/** Always (true), never (false), or by finish (null). */
export const setBaselineOverride = (productId: number, use: boolean | null) =>
  request<{ ok: true }>(`/api/products/${productId}/calibration/baseline`, { method: "PUT", body: JSON.stringify({ use }) });
