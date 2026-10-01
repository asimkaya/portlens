import { ChevronDown, ChevronUp, Globe, Lock, Power, ShieldCheck } from "lucide-react";
import { folderOf, hueOf } from "../format";
import type { Sort, SortKey } from "../filter";
import { describeBinding, describeState, type Row } from "../rows";

interface Props {
  rows: Row[];
  selectedKey: string | null;
  fresh: ReadonlySet<string>;
  leaving: ReadonlySet<string>;
  sort: Sort;
  onSort(key: SortKey): void;
  onSelect(row: Row): void;
  onStop(row: Row): void;
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort(key: SortKey): void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = sort.direction === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      className={className}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" className="sort-button" onClick={() => onSort(sortKey)}>
        {label}
        {active && <Icon size={14} aria-hidden="true" />}
      </button>
    </th>
  );
}

export function Avatar({ name, system }: { name: string; system: boolean }) {
  if (system) {
    return (
      <span className="avatar is-system" aria-hidden="true">
        <ShieldCheck size={17} />
      </span>
    );
  }
  return (
    <span
      className="avatar"
      style={{ "--hue": hueOf(name) } as React.CSSProperties}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function processDetail(row: Row): string {
  const { services, exe } = row.process;
  if (services.length) {
    return services.length > 1 ? `${services[0]} +${services.length - 1}` : services[0];
  }
  return exe ? folderOf(exe) : "Path not available";
}

export function PortTable({
  rows,
  selectedKey,
  fresh,
  leaving,
  sort,
  onSort,
  onSelect,
  onStop,
}: Props) {
  return (
    <table className="table">
      <colgroup>
        <col className="col-port" />
        <col />
        <col className="col-address" />
        <col className="col-state" />
        <col className="col-pid" />
        <col className="col-action" />
      </colgroup>
      <thead>
        <tr>
          <SortHeader label="Port" sortKey="port" sort={sort} onSort={onSort} />
          <SortHeader label="Process" sortKey="process" sort={sort} onSort={onSort} />
          <th>Address</th>
          <th>State</th>
          <SortHeader label="PID" sortKey="pid" sort={sort} onSort={onSort} className="num" />
          <th>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const { process } = row;
          const locked = process.protection === "locked";
          const classes = [
            "row",
            row.key === selectedKey && "is-selected",
            fresh.has(row.key) && "is-fresh",
            leaving.has(row.key) && "is-leaving",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <tr
              key={row.key}
              data-key={row.key}
              className={classes}
              tabIndex={leaving.has(row.key) ? -1 : 0}
              aria-selected={row.key === selectedKey}
              onClick={() => onSelect(row)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(row);
                }
              }}
            >
              <td>
                <div className="port-cell">
                  <span className={row.exposed ? "port-tag is-exposed" : "port-tag"}>
                    {row.port}
                  </span>
                  <span className="protocol">{row.protocol.toUpperCase()}</span>
                </div>
              </td>
              <td>
                <div className="process-cell">
                  <Avatar name={process.name} system={process.is_system} />
                  <div className="process-text">
                    <span className="process-name">{process.name}</span>
                    <span className="process-detail">{processDetail(row)}</span>
                  </div>
                </div>
              </td>
              <td>
                <span className="address">
                  {row.exposed ? (
                    <Globe
                      size={14}
                      className="address-icon is-exposed"
                      aria-label="Open to network"
                    />
                  ) : (
                    <Lock size={14} className="address-icon" aria-label="This computer only" />
                  )}
                  {describeBinding(row)}
                </span>
              </td>
              <td>
                <span className={row.listening ? "state is-listening" : "state"}>
                  <i aria-hidden="true" />
                  {describeState(row)}
                </span>
              </td>
              <td className="num">{process.pid === 0 ? "–" : process.pid}</td>
              <td className="actions">
                <button
                  type="button"
                  className="stop-button"
                  disabled={locked || process.pid === 0}
                  title={
                    locked ? (process.protection_reason ?? "Protected") : `Stop ${process.name}`
                  }
                  aria-label={`Stop ${process.name} on port ${row.port}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onStop(row);
                  }}
                >
                  <Power size={15} aria-hidden="true" />
                  Stop
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
