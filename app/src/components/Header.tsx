import { Pause, Pin, Play, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Logo } from "./Logo";

interface Props {
  query: string;
  onQuery(query: string): void;
  searchRef: RefObject<HTMLInputElement | null>;
  showSearch: boolean;
  paused: boolean;
  onTogglePause(): void;
  pinned: boolean;
  onTogglePin(): void;
  onClose(): void;
}

export function Header({
  query,
  onQuery,
  searchRef,
  showSearch,
  paused,
  onTogglePause,
  pinned,
  onTogglePin,
  onClose,
}: Props) {
  return (
    <header className="header">
      <div className="header-row">
        <div className="brand">
          <Logo size={26} />
          <span className="brand-name">Portlens</span>
        </div>

        <div className="header-actions">
          <span className={paused ? "live is-paused" : "live"} role="status">
            <i className="live-light" aria-hidden="true" />
            {paused ? "Paused" : "Live"}
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={onTogglePause}
            aria-label={paused ? "Resume live updates" : "Pause live updates"}
            title={paused ? "Resume live updates" : "Pause live updates"}
          >
            {paused ? <Play size={16} /> : <Pause size={16} />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            aria-label="Keep open"
            title={pinned ? "Let it close when you click away" : "Keep open when you click away"}
          >
            <Pin size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Hide Portlens"
            title="Hide (Esc)"
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {showSearch && (
        <label className="search">
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search port, program or PID"
            aria-label="Search ports"
            autoComplete="off"
            spellCheck={false}
          />
          {query ? (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => onQuery("")}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd aria-hidden="true">/</kbd>
          )}
        </label>
      )}
    </header>
  );
}
