import { Link } from "react-router";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { TipsPanel } from "./TipsPanel";

export function Header() {
  return (
    <header className="print-hide sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Link to="/" className="flex shrink-0 items-baseline gap-2">
          <img src="/favicon.svg" alt="" width={22} height={22} className="self-center" />
          <span className="text-base font-semibold tracking-tight">Spoolkeeper</span>
          <span className="text-[10px] font-normal text-ink-500">v{__APP_VERSION__}</span>
        </Link>
        <div className="ml-auto flex items-center gap-2 sm:order-last">
          <Link to="/settings" aria-label="Settings" title="Settings" className="rounded-md border border-ink-700 bg-ink-900/60 px-2 py-1 text-sm text-ink-300 hover:text-ink-100">
            <span aria-hidden>⚙️</span>
          </Link>
          <ThemeSwitcher />
        </div>
        {/* Full width on its own row on phones; shares the header row on wider screens. */}
        <div className="order-last flex w-full min-w-0 justify-end sm:order-none sm:w-auto sm:flex-1">
          <TipsPanel />
        </div>
      </div>
    </header>
  );
}
