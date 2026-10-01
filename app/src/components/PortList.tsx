import { ChevronRight, Power } from "lucide-react";
import { describeBinding, type Row } from "../rows";

interface Props {
  rows: Row[];
  fresh: ReadonlySet<string>;
  leaving: ReadonlySet<string>;
  onSelect(row: Row): void;
  onStop(row: Row): void;
}

/** Moves focus to the neighbouring row, so the list can be driven with the arrow keys. */
function moveFocus(from: HTMLElement, direction: 1 | -1) {
  const rows = [...from.closest("ul")!.querySelectorAll<HTMLElement>(".row-main")];
  rows[rows.indexOf(from) + direction]?.focus();
}

export function PortList({ rows, fresh, leaving, onSelect, onStop }: Props) {
  return (
    <ul className="port-list">
      {rows.map((row) => {
        const { process } = row;
        const stoppable = process.protection !== "locked" && process.pid !== 0;
        const classes = [
          "row",
          fresh.has(row.key) && "is-fresh",
          leaving.has(row.key) && "is-leaving",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <li key={row.key} className={classes}>
            <button
              type="button"
              className="row-main"
              data-key={row.key}
              tabIndex={leaving.has(row.key) ? -1 : 0}
              onClick={() => onSelect(row)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  moveFocus(e.currentTarget, e.key === "ArrowDown" ? 1 : -1);
                } else if (e.key === "Delete" && stoppable) {
                  e.preventDefault();
                  onStop(row);
                }
              }}
            >
              <span className={row.exposed ? "port-tag is-exposed" : "port-tag"}>{row.port}</span>
              <span className="row-text">
                <span className="row-name">{process.name}</span>
                <span className="row-sub">
                  <span className="row-protocol">{row.protocol.toUpperCase()}</span>
                  <span className={row.exposed ? "is-exposed" : undefined}>
                    {describeBinding(row)}
                  </span>
                </span>
              </span>
              <ChevronRight size={16} className="row-chevron" aria-hidden="true" />
            </button>

            {stoppable && (
              <button
                type="button"
                className="row-stop"
                title={`Stop ${process.name}`}
                aria-label={`Stop ${process.name} on port ${row.port}`}
                onClick={() => onStop(row)}
              >
                <Power size={15} aria-hidden="true" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
