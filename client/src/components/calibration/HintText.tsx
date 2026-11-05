import type { Hint } from "../../api/calibration";

/** A short headline; when there's more to say, the headline toggles the explanation. */
export function HintText({ hint }: { hint: Hint }) {
  if (!hint.detail) return <span className="font-medium">{hint.title}</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
        {hint.title}{" "}
        <span aria-hidden className="inline-block text-xs opacity-60 transition-transform group-open:rotate-90">
          ▸
        </span>
      </summary>
      <p className="mt-0.5 text-xs leading-snug font-normal opacity-80">{hint.detail}</p>
    </details>
  );
}
