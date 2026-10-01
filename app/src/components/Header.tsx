import { Pause, Play, Search, X } from "lucide-react";
import type { RefObject } from "react";
import { Logo } from "./Logo";

interface Props {
  query: string;
  onQuery(query: string): void;
  searchRef: RefObject<HTMLInputElement | null>;
  paused: boolean;
  onTogglePause(): void;
}

export function Header({ query, onQuery, searchRef, paused, onTogglePause }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <Logo />
        <span className="brand-name">Portlens</span>
      </div>

      <label className="search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by port, process, PID or path"
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
            <X size={16} />
          </button>
        ) : (
          <kbd aria-hidden="true">/</kbd>
        )}
      </label>

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
          {paused ? <Play size={17} /> : <Pause size={17} />}
        </button>
      </div>
    </header>
  );
}
