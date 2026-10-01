import { Globe } from "lucide-react";
import type { Filters } from "../filter";

interface Props {
  filters: Filters;
  onChange(filters: Filters): void;
  hiddenSystem: number;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "is-active" : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function FilterBar({ filters, onChange, hiddenSystem }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <div className="filters">
      <Segmented
        label="Which sockets to show"
        value={filters.scope}
        onChange={(scope) => set({ scope })}
        options={[
          { value: "listening", label: "Listening" },
          { value: "all", label: "All connections" },
        ]}
      />
      <Segmented
        label="Protocol"
        value={filters.protocol}
        onChange={(protocol) => set({ protocol })}
        options={[
          { value: "any", label: "Any" },
          { value: "tcp", label: "TCP" },
          { value: "udp", label: "UDP" },
        ]}
      />
      <button
        type="button"
        className="chip"
        aria-pressed={filters.exposedOnly}
        onClick={() => set({ exposedOnly: !filters.exposedOnly })}
        title="Only ports that other devices on your network can reach"
      >
        <Globe size={15} aria-hidden="true" />
        Open to network
      </button>

      <button
        type="button"
        role="switch"
        className="switch"
        aria-checked={filters.showSystem}
        onClick={() => set({ showSystem: !filters.showSystem })}
      >
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        Windows processes
        {hiddenSystem > 0 && <span className="switch-count">{hiddenSystem} hidden</span>}
      </button>
    </div>
  );
}
