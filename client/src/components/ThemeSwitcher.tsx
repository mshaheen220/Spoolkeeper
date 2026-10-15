import { setTheme, useTheme, type ThemeChoice } from "../hooks/useTheme";

const OPTIONS: { value: ThemeChoice; icon: string; label: string }[] = [
  { value: "day", icon: "☀️", label: "Day theme" },
  { value: "night", icon: "🌙", label: "Night theme" },
  { value: "system", icon: "💻", label: "Follow system theme" },
];

export function ThemeSwitcher() {
  const { choice } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="flex shrink-0 rounded-md border border-ink-700 bg-ink-900/60 p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => setTheme(o.value)}
          className={`rounded px-2 py-1 text-sm transition-colors ${
            choice === o.value ? "bg-ink-700 text-ink-50" : "text-ink-400 hover:text-ink-100"
          }`}
        >
          <span aria-hidden>{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
