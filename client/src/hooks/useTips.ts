import { useEffect, useState } from "react";
import { fetchTips, type Tip } from "../api/client";

// Module-level cache so multiple components mounted at once share a single
// request instead of each fetching the list.
let tipsPromise: Promise<Tip[]> | null = null;

function loadTips(): Promise<Tip[]> {
  if (!tipsPromise) {
    tipsPromise = fetchTips().catch((err) => {
      tipsPromise = null; // let the next mount retry instead of caching the failure
      throw err;
    });
  }
  return tipsPromise;
}

export function useTips(): { tips: Tip[]; isLoading: boolean } {
  const [tips, setTips] = useState<Tip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadTips()
      .then((loaded) => {
        if (!cancelled) setTips(loaded);
      })
      .catch(() => {
        // Tips are decoration, not load-bearing - degrade to showing none
        // rather than surfacing an error.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { tips, isLoading };
}
