import { useSyncExternalStore } from "react";

export type ThemeChoice = "day" | "night" | "system";

const STORAGE_KEY = "theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function readStored(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "day" || v === "night" ? v : "system";
  } catch {
    return "system";
  }
}

function resolve(choice: ThemeChoice): "day" | "night" {
  return choice === "system" ? (media.matches ? "night" : "day") : choice;
}

function apply() {
  if (resolve(choice) === "day") document.documentElement.setAttribute("data-theme", "day");
  else document.documentElement.removeAttribute("data-theme");
}

// Module-level store so every useTheme() caller re-renders together.
let choice = readStored();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

media.addEventListener("change", () => {
  if (choice === "system") {
    apply();
    notify();
  }
});

export function setTheme(next: ThemeChoice) {
  choice = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preference just won't persist.
  }
  apply();
  notify();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The user's choice plus the theme actually in effect. */
export function useTheme(): { choice: ThemeChoice; resolved: "day" | "night" } {
  const c = useSyncExternalStore(subscribe, () => choice);
  const resolved = useSyncExternalStore(subscribe, () => resolve(choice));
  return { choice: c, resolved };
}
