import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, messageOf, type PortSelection } from "./api";
import { DetailView } from "./components/DetailView";
import { FilterChips } from "./components/FilterChips";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { PortList } from "./components/PortList";
import { StopDialog } from "./components/StopDialog";
import { Toasts, type Toast } from "./components/Toasts";
import { applyFilters, countHiddenSystem, defaultFilters, sortRows, type Filters } from "./filter";
import type { Row } from "./rows";
import { useSnapshot } from "./useSnapshot";

/** How long a port picked in the tray menu waits for the list to catch up. */
const SELECTION_PATIENCE_MS = 4000;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select");
}

export default function App() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [paused, setPaused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [windowVisible, setWindowVisible] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PortSelection | null>(null);
  const [stopping, setStopping] = useState<Row | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [elevated, setElevated] = useState<boolean | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const searchRef = useRef<HTMLInputElement>(null);
  const nextToastId = useRef(0);

  // Nothing needs updating while the window is tucked away in the tray.
  const { rows, fresh, leaving, error, loaded, refresh } = useSnapshot(!paused && windowVisible);

  const shownRows = useMemo(() => sortRows(applyFilters(rows, filters)), [rows, filters]);
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
    const unlistenVisible = api.onWindowVisible(setWindowVisible);
    const unlistenSelect = api.onSelectPort((selection) => {
      // Make sure the filters cannot hide the port that was just asked for.
      setFilters(defaultFilters);
      setPendingSelection(selection);
    });
    return () => {
      void unlistenVisible.then((stop) => stop());
      void unlistenSelect.then((stop) => stop());
    };
  }, []);

  // The tray menu can name a port the list has not loaded yet, so keep the
  // request until the matching row shows up.
  useEffect(() => {
    if (!pendingSelection) return;
    const match = rows.find(
      (row) =>
        row.listening &&
        !leaving.has(row.key) &&
        row.port === pendingSelection.port &&
        row.protocol === pendingSelection.protocol &&
        row.process.pid === pendingSelection.pid,
    );
    if (match) {
      setSelectedKey(match.key);
      setPendingSelection(null);
      return;
    }
    const giveUp = setTimeout(() => setPendingSelection(null), SELECTION_PATIENCE_MS);
    return () => clearTimeout(giveUp);
  }, [pendingSelection, rows, leaving]);

  // A process that exited takes its details with it.
  useEffect(() => {
    if (selectedKey && loaded && !selected) setSelectedKey(null);
  }, [selectedKey, selected, loaded]);

  const requestStop = useCallback((row: Row) => {
    if (row.process.protection !== "locked" && row.process.pid !== 0) setStopping(row);
  }, []);

  const hideWindow = useCallback(() => void api.hideWindow(), []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (stopping) return;

      const typing = isTyping(event.target);
      const search = searchRef.current;

      if ((event.key === "/" && !typing && !selectedKey) || (event.key === "f" && event.ctrlKey)) {
        event.preventDefault();
        setSelectedKey(null);
        // The input only exists in the list view, so wait for it to render.
        requestAnimationFrame(() => {
          searchRef.current?.focus();
          searchRef.current?.select();
        });
        return;
      }

      if (event.key === "Escape") {
        if (typing && event.target === search && filters.query) {
          setFilters((f) => ({ ...f, query: "" }));
        } else if (selectedKey) {
          setSelectedKey(null);
        } else {
          hideWindow();
        }
        return;
      }

      if (event.key === "ArrowDown" && event.target === search) {
        event.preventDefault();
        document.querySelector<HTMLElement>(".row-main")?.focus();
        return;
      }

      if (event.key === "Delete" && !typing && selected) {
        event.preventDefault();
        requestStop(selected);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [stopping, filters.query, selectedKey, selected, requestStop, hideWindow]);

  function togglePin() {
    const next = !pinned;
    setPinned(next);
    void api.setPinned(next);
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
        showSearch={!selected}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        pinned={pinned}
        onTogglePin={togglePin}
        onClose={hideWindow}
      />

      {selected ? (
        <DetailView
          key={selected.key}
          row={selected}
          onBack={() => setSelectedKey(null)}
          onStop={requestStop}
          onOpenInBrowser={openInBrowser}
        />
      ) : (
        <>
          <FilterChips filters={filters} onChange={setFilters} hiddenSystem={hiddenSystem} />

          <main className="list-area" aria-label="Ports">
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
                    <p>Search covers ports, programs, PIDs, paths and Windows service names.</p>
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
                    <p className="empty-title">None of your programs are listening</p>
                    <p>{hiddenSystem} ports that belong to Windows are hidden.</p>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setFilters((f) => ({ ...f, showSystem: true }))}
                    >
                      Show Windows ports
                    </button>
                  </>
                ) : (
                  <p className="empty-title">No ports match these filters</p>
                )}
              </div>
            )}

            {shownRows.length > 0 && (
              <PortList
                rows={shownRows}
                fresh={fresh}
                leaving={leaving}
                onSelect={(row) => setSelectedKey(row.key)}
                onStop={requestStop}
              />
            )}
          </main>
        </>
      )}

      <Footer
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
