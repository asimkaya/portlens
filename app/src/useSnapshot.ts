import { useCallback, useEffect, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { toRows, type Row } from "./rows";
import type { Snapshot } from "./types";

const POLL_MS = 2000;
const FRESH_MS = 2400;
const LEAVING_MS = 700;

interface View {
  rows: Row[];
  /** Appeared since the previous poll. */
  fresh: ReadonlySet<string>;
  /** Disappeared since the previous poll; kept briefly so they can fade out. */
  leaving: ReadonlySet<string>;
}

const EMPTY: ReadonlySet<string> = new Set();

export function useSnapshot(active: boolean) {
  const [view, setView] = useState<View>({ rows: [], fresh: EMPTY, leaving: EMPTY });
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const previous = useRef<Map<string, Row> | null>(null);

  const apply = useCallback((snapshot: Snapshot) => {
    const rows = toRows(snapshot);
    const before = previous.current;
    previous.current = new Map(rows.map((row) => [row.key, row]));

    // The first poll would flag everything as new.
    if (!before) {
      setView({ rows, fresh: EMPTY, leaving: EMPTY });
      return;
    }

    const now = new Set(rows.map((row) => row.key));
    const fresh = new Set(rows.filter((row) => !before.has(row.key)).map((row) => row.key));
    const gone = [...before.values()].filter((row) => !now.has(row.key));
    const goneKeys = new Set(gone.map((row) => row.key));

    setView({ rows: [...rows, ...gone], fresh, leaving: goneKeys });

    if (fresh.size) {
      setTimeout(() => setView((v) => ({ ...v, fresh: EMPTY })), FRESH_MS);
    }
    if (gone.length) {
      setTimeout(
        () =>
          setView((v) => ({
            ...v,
            rows: v.rows.filter((row) => !goneKeys.has(row.key)),
            leaving: EMPTY,
          })),
        LEAVING_MS,
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.snapshot());
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(messageOf(e));
    }
  }, [apply]);

  useEffect(() => {
    if (!active) return;

    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      await refresh();
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, refresh]);

  return { ...view, error, loaded, refresh };
}
