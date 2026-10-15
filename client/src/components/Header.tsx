import { Link } from "react-router";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { TipsPanel } from "./TipsPanel";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <Link to="/" className="flex shrink-0 items-baseline gap-2">
          <img src="/favicon.svg" alt="" width={22} height={22} className="self-center" />
          <span className="text-base font-semibold tracking-tight">Spoolkeeper</span>
          <span className="text-[10px] font-normal text-ink-500">v{__APP_VERSION__}</span>
        </Link>
        <div className="ml-auto sm:order-last">
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
