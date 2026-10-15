import { Link, Route, Routes } from "react-router";
import { Header } from "./components/Header";
import { IntakePage } from "./pages/IntakePage";
import { SpoolDetailPage } from "./pages/SpoolDetailPage";
import { SpoolsPage } from "./pages/SpoolsPage";

function NotFound() {
  return (
    <p className="text-sm text-ink-400">
      Nothing here.{" "}
      <Link to="/" className="text-accent-400 underline">
        Back to spools
      </Link>
    </p>
  );
}

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<SpoolsPage />} />
          <Route path="/spools/new" element={<IntakePage />} />
          <Route path="/spools/:id" element={<SpoolDetailPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}
