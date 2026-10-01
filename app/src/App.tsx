import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, messageOf } from "./api";
import { DetailPanel } from "./components/DetailPanel";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { PortTable } from "./components/PortTable";
import { StatusBar } from "./components/StatusBar";
import { StopDialog } from "./components/StopDialog";
import { Toasts, type Toast } from "./components/Toasts";
import {
  applyFilters,
  countHiddenSystem,
  defaultFilters,
  sortRows,
  type Filters,
  type Sort,
  type SortKey,
} from "./filter";
import type { Row } from "./rows";
import { useSnapshot } from "./useSnapshot";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]")
  );
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [sort, setSort] = useState<Sort>({ key: "port", direction: "asc" });
  const [paused, setPaused] = useState(false);
  const [windowVisible, setWindowVisible] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stopping, setStopping] = useState<Row | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const focusSelection = useRef(false);
  const nextToastId = useRef(0);

  // Nothing needs updating while the window sits in the tray.
  const { rows, fresh, leaving, error, loaded, refresh } = useSnapshot(!paused && windowVisible);

  const shownRows = useMemo(
    () => sortRows(applyFilters(rows, filters), sort),
    [rows, filters, sort],
  );
  const hiddenSystem = useMemo(() => countHiddenSystem(rows, filters), [rows, filters]);
  const selected = useMemo(
    () => rows.find((row) => row.key === selectedKey && !leaving.has(row.key)) ?? null,
    [rows, leaving, selectedKey],
  );

  const toast = useCallback((kind: Toast["kind"], message: string) => {
    const id = nextToastId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(
      () => setToasts((current) => current.filter((t) => t.id !== id)),
      kind === "error" ? 8000 : 4500,
    );
  }, []);

  useEffect(() => {
    api.isElevated().then(setElevated, () => setElevated(null));
    const unlisten = api.onWindowVisible(setWindowVisible);
    return () => void unlisten.then((stop) => stop());
  }, []);

  // A process that exited takes its details panel with it.
  useEffect(() => {
    if (selectedKey && loaded && !selected) setSelectedKey(null);
  }, [selectedKey, selected, loaded]);

  useEffect(() => {
    if (!selectedKey) return;
    const element = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(selectedKey)}"]`);
    element?.scrollIntoView({ block: "nearest" });
    if (focusSelection.current) element?.focus({ preventScroll: true });
    focusSelection.current = false;
  }, [selectedKey]);

  const select = useCallback((row: Row | null) => setSelectedKey(row?.key ?? null), []);

  const requestStop = useCallback((row: Row) => {
    if (row.process.protection !== "locked" && row.process.pid !== 0) setStopping(row);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (stopping) return;

      const typing = isTyping(event.target);
      const search = searchRef.current;

      if ((event.key === "/" && !typing) || (event.key === "f" && event.ctrlKey)) {
        event.preventDefault();
        search?.focus();
        search?.select();
        return;
      }

      if (event.key === "Escape") {
        if (typing && event.target === search) {
          if (filters.query) setFilters((f) => ({ ...f, query: "" }));
          else search?.blur();
        } else if (selectedKey) {
          setSelectedKey(null);
        }
        return;
      }

      const arrow = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      const fromSearch = event.target === search && arrow === 1;
      if (arrow && (!typing || fromSearch)) {
        event.preventDefault();
        const current = shownRows.findIndex((row) => row.key === selectedKey);
        const next = shownRows[Math.min(Math.max(current + arrow, 0), shownRows.length - 1)];
        if (next) {
          focusSelection.current = true;
          setSelectedKey(next.key);
        }
        return;
      }

      if (event.key === "Delete" && !typing && selected) {
        event.preventDefault();
        requestStop(selected);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [stopping, filters.query, selectedKey, selected, shownRows, requestStop]);

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  }

  async function confirmStop(tree: boolean) {
    if (!stopping) return;
    const { process } = stopping;
    setStopBusy(true);
    try {
      const report = await api.stopProcess(process.pid, process.started_at, tree);
      if (report.stopped.includes(process.pid)) {
        const others = report.stopped.length - 1;
        toast(
          "success",
          `Stopped ${process.name} (PID ${process.pid})${others > 0 ? ` and ${others} more` : ""}.`,
        );
      }
      for (const failure of report.failed) {
        toast("error", `PID ${failure.pid}: ${failure.message}`);
      }
    } catch (e) {
      toast("error", messageOf(e));
    } finally {
      setStopBusy(false);
      setStopping(null);
      void refresh();
    }
  }

  async function restartAsAdmin() {
    try {
      await api.restartAsAdmin();
    } catch (e) {
      toast("error", messageOf(e));
    }
  }

  const openInBrowser = (port: number) =>
    api.openInBrowser(port).catch((e) => toast("error", messageOf(e)));

  return (
    <div className="app">
      <Header
        query={filters.query}
        onQuery={(query) => setFilters((f) => ({ ...f, query }))}
        searchRef={searchRef}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
      />
      <FilterBar filters={filters} onChange={setFilters} hiddenSystem={hiddenSystem} />

      <main className={selected ? "main has-detail" : "main"}>
        <section className="list" aria-label="Ports">
          {error && (
            <p className="banner" role="alert">
              Could not read the port list: {error}
            </p>
          )}

          {!loaded && !error && <p className="empty">Reading your ports…</p>}

          {loaded && shownRows.length === 0 && (
            <div className="empty">
              {filters.query ? (
                <>
                  <p className="empty-title">No ports match “{filters.query}”</p>
                  <p>
                    Search looks at ports, process names, PIDs, paths and Windows service names.
                  </p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setFilters((f) => ({ ...f, query: "" }))}
                  >
                    Clear search
                  </button>
                </>
              ) : hiddenSystem > 0 ? (
                <>
                  <p className="empty-title">Nothing from your own programs is listening</p>
                  <p>{hiddenSystem} ports that belong to Windows are hidden.</p>
                  <button
                    type="button"
                    className="button"
                    onClick={() => setFilters((f) => ({ ...f, showSystem: true }))}
                  >
                    Show Windows processes
                  </button>
                </>
              ) : (
                <p className="empty-title">No ports match these filters</p>
              )}
            </div>
          )}

          {shownRows.length > 0 && (
            <PortTable
              rows={shownRows}
              selectedKey={selectedKey}
              fresh={fresh}
              leaving={leaving}
              sort={sort}
              onSort={toggleSort}
              onSelect={select}
              onStop={requestStop}
            />
          )}
        </section>

        {selected && (
          <DetailPanel
            key={selected.key}
            row={selected}
            onClose={() => select(null)}
            onStop={requestStop}
            onOpenInBrowser={openInBrowser}
          />
        )}
      </main>

      <StatusBar
        shown={shownRows.filter((row) => !leaving.has(row.key)).length}
        elevated={elevated}
        onRestartAsAdmin={restartAsAdmin}
      />

      {stopping && (
        <StopDialog
          row={stopping}
          busy={stopBusy}
          onCancel={() => setStopping(null)}
          onConfirm={confirmStop}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  );
}
