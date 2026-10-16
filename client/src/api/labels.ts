import { request } from "./client";

export interface LabelTemp {
  text: string;
  /** Measured by calibration (vs. the maker's range). */
  tuned: boolean;
}

export interface LabelData {
  spoolId: number;
  url: string;
  brand: string;
  material: string;
  finishes: string[];
  colorName: string | null;
  colorHex: string | null;
  colorHexes: string[] | null;
  multiColorDirection: "coaxial" | "longitudinal" | null;
  nozzle: LabelTemp | null;
  bed: LabelTemp | null;
  dry: string | null;
}

export interface LabelsResponse {
  size: { widthMm: number; heightMm: number };
  baseUrl: string;
  labels: LabelData[];
  missing: number[];
}

export const fetchLabels = (ids: number[]) => request<LabelsResponse>(`/api/labels?ids=${ids.join(",")}`);
