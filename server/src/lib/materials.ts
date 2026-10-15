// Typical values per OrcaSlicer filament_type: the lowest-priority
// suggestion during intake (always labelled "Material default") and the
// material list the intake form offers. Ranges are deliberately the common
// middle of manufacturer guidance, not anyone's tuned result.
export interface MaterialDefaults {
  type: string; // OrcaSlicer filament_type
  density: number;
  nozzle: [number, number];
  bed: [number, number];
  dry: [number, number]; // °C, hours
}

export const MATERIALS: MaterialDefaults[] = [
  { type: "PLA", density: 1.24, nozzle: [190, 220], bed: [50, 60], dry: [50, 5] },
  { type: "PETG", density: 1.27, nozzle: [230, 250], bed: [70, 85], dry: [65, 5] },
  { type: "TPU", density: 1.21, nozzle: [210, 230], bed: [40, 60], dry: [55, 7] },
  { type: "ABS", density: 1.04, nozzle: [240, 260], bed: [90, 110], dry: [80, 4] },
  { type: "ASA", density: 1.07, nozzle: [240, 260], bed: [90, 110], dry: [80, 4] },
  { type: "PA", density: 1.14, nozzle: [250, 280], bed: [70, 90], dry: [80, 8] },
  { type: "PC", density: 1.2, nozzle: [260, 300], bed: [100, 120], dry: [80, 6] },
  { type: "PLA-CF", density: 1.29, nozzle: [200, 230], bed: [50, 60], dry: [55, 6] },
  { type: "PETG-CF", density: 1.3, nozzle: [240, 260], bed: [70, 85], dry: [65, 6] },
  { type: "PVA", density: 1.23, nozzle: [190, 210], bed: [45, 60], dry: [50, 6] },
  { type: "HIPS", density: 1.04, nozzle: [230, 250], bed: [90, 110], dry: [70, 4] },
];

export function materialDefaults(type: string): MaterialDefaults | null {
  return MATERIALS.find((m) => m.type.toLowerCase() === type.trim().toLowerCase()) ?? null;
}
