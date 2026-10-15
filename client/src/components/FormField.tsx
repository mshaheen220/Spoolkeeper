import { useId, type ReactNode } from "react";
import type { Source } from "../types";
import { SourceBadge } from "./SourceBadge";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "url" | "color" | "date";
  unit?: string;
  step?: number;
  help?: string;
  placeholder?: string;
  list?: string;
  required?: boolean;
  provenance?: { source: Source; sourceRef?: string | null };
  className?: string;
  children?: ReactNode;
}

/** Labelled input with unit suffix, inline help and a badge for where its value came from. */
export function FormField({ label, value, onChange, type = "text", unit, step, help, placeholder, list, required, provenance, className }: Props) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#808080";
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="min-w-0 truncate text-sm font-medium text-ink-200">
          {label}
          {required && <span className="text-accent-400"> *</span>}
        </label>
        {provenance && value !== "" && <SourceBadge compact source={provenance.source} sourceRef={provenance.sourceRef} />}
      </div>
      <div className="flex items-center gap-2">
        {type === "color" && (
          <input
            type="color"
            aria-label={`${label} picker`}
            value={hex}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-ink-700 bg-ink-900 p-1"
          />
        )}
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type={type === "color" ? "text" : type}
            inputMode={type === "number" ? "decimal" : undefined}
            step={step ?? (type === "number" ? "any" : undefined)}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder ?? (type === "color" ? "#RRGGBB" : undefined)}
            list={list}
            required={required}
            aria-describedby={helpId}
            className={`field ${unit ? "pr-14" : ""}`}
          />
          {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-500">{unit}</span>}
        </div>
      </div>
      {help && (
        <p id={helpId} className="mt-1 text-xs leading-snug text-ink-400">
          {help}
        </p>
      )}
    </div>
  );
}
