import type { Product } from "../types";
import { request } from "./client";

export type TestId = "temp" | "mvs" | "pa" | "flow1" | "flow2" | "flow_yolo" | "retraction" | "cooling";
export type StepId = "temp" | "mvs" | "pa" | "flow" | "retraction" | "cooling";
export type LinearAdvance = "unknown" | "supported" | "unsupported";

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
}

export interface TestInfo {
  id: TestId;
  step: StepId;
  title: string;
  optional: boolean;
  why: string;
  orcaMenu: string[];
  instructions: string[];
  params: InputField[];
  observation: InputField[];
  suggestedParams: Record<string, string | number | boolean>;
  suggestedObservation: Record<string, string | number | boolean>;
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
}

export interface TunedValue extends ResultValue {
  runId: number;
  test: TestId;
  date: string;
}

export interface CalibrationState {
  spoolId: number;
  product: Product;
  linearAdvance: LinearAdvance;
  tests: TestInfo[];
  runs: CalibrationRun[];
  tuned: Record<string, TunedValue>;
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

export const setRunAccepted = (runId: number, accepted: boolean) =>
  request<{ run: CalibrationRun }>(`/api/calibration/runs/${runId}`, { method: "PATCH", body: JSON.stringify({ accepted }) });
