import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { Source } from "../types";
import { SourceBadge } from "./SourceBadge";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  help?: string;
  required?: boolean;
  provenance?: { source: Source; sourceRef?: string | null };
  /** Shown for a typed value that isn't in the list, e.g. "Add new brand". */
  newLabel?: string;
  className?: string;
}

/**
 * Text input with a pick list (ARIA combobox). Unlike a native <datalist>,
 * which hides every option that doesn't match what's already typed, opening
 * it shows the full list; typing then narrows it. Free text is allowed.
 */
export function ComboField({ label, value, onChange, options, placeholder, help, required, provenance, newLabel = "Use", className }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [open, setOpen] = useState(false);
  // Only filter once the user types; just opening shows everything.
  const [typed, setTyped] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const shown = useMemo(() => {
    const unique = [...new Set(options.filter(Boolean))];
    if (!typed || !value.trim()) return unique;
    const v = value.trim().toLowerCase();
    return unique.filter((o) => o.toLowerCase().includes(v));
  }, [options, value, typed]);
  // Keep the highlighted option (on open: the current value) scrolled into view.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const exact = options.some((o) => o.toLowerCase() === value.trim().toLowerCase());

  const openList = () => {
    setTyped(false);
    setOpen(true);
    setActive(Math.max(0, options.findIndex((o) => o.toLowerCase() === value.trim().toLowerCase())));
  };
  const close = () => {
    setOpen(false);
    setActive(-1);
  };
  const pick = (o: string) => {
    onChange(o);
    close();
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) return openList();
      setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && shown[active]) {
      e.preventDefault();
      pick(shown[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label htmlFor={id} className="min-w-0 truncate text-sm font-medium text-ink-200">
          {label}
          {required && <span className="text-accent-400"> *</span>}
        </label>
        {provenance && value !== "" && <SourceBadge compact source={provenance.source} sourceRef={provenance.sourceRef} />}
      </div>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          className="field pr-9"
          value={value}
          placeholder={placeholder}
          required={required}
          aria-describedby={help ? `${id}-help` : undefined}
          onFocus={openList}
          onClick={() => !open && openList()}
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          // Delay so a tap on an option registers before the list closes.
          onBlur={() => setTimeout(close, 150)}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Show all ${label.toLowerCase()} options`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => (open ? close() : (openList(), inputRef.current?.focus()))}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-ink-400 hover:text-ink-100"
        >
          <span aria-hidden>{open ? "▴" : "▾"}</span>
        </button>
      </div>
      {open && (shown.length > 0 || (value.trim() && !exact)) && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-ink-700 bg-ink-900 py-1 shadow-lg"
        >
          {shown.map((o, i) => (
            <li
              key={o}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.toLowerCase() === value.trim().toLowerCase()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o)}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? "bg-ink-800 text-ink-50" : "text-ink-200"}`}
            >
              {o}
              {o.toLowerCase() === value.trim().toLowerCase() && <span className="ml-2 text-accent-400">✓</span>}
            </li>
          ))}
          {value.trim() && !exact && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(value.trim())}
              className="cursor-pointer border-t border-ink-800 px-3 py-2 text-xs text-ink-400 hover:bg-ink-800"
            >
              {newLabel} “{value.trim()}”
            </li>
          )}
        </ul>
      )}
      {help && (
        <p id={`${id}-help`} className="mt-1 text-xs leading-snug text-ink-400">
          {help}
        </p>
      )}
    </div>
  );
}
