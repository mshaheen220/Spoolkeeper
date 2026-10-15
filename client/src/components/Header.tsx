import { Link } from "react-router";

export function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2">
        <Link to="/" className="flex shrink-0 items-baseline gap-2">
          <img src="/favicon.svg" alt="" width={22} height={22} className="self-center" />
          <span className="text-base font-semibold tracking-tight">Spoolkeeper</span>
          <span className="text-[10px] font-normal text-ink-500">v{__APP_VERSION__}</span>
        </Link>
      </div>
    </header>
  );
}
