import { Header } from "./components/Header";

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">
        <p className="text-sm text-ink-400">Spoolkeeper is getting set up.</p>
      </main>
    </div>
  );
}
