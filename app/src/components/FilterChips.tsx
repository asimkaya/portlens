import type { Filters } from "../filter";

interface Props {
  filters: Filters;
  onChange(filters: Filters): void;
  hiddenSystem: number;
}

function Chip({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  onClick(): void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

export function FilterChips({ filters, onChange, hiddenSystem }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const toggleProtocol = (protocol: "tcp" | "udp") =>
    set({ protocol: filters.protocol === protocol ? "any" : protocol });

  return (
    <div className="chips" role="group" aria-label="Filters">
      <Chip
        pressed={filters.scope === "all"}
        onClick={() => set({ scope: filters.scope === "all" ? "listening" : "all" })}
        title="Include connections to other machines, not only ports waiting for traffic"
      >
        All connections
      </Chip>
      <Chip pressed={filters.protocol === "tcp"} onClick={() => toggleProtocol("tcp")}>
        TCP
      </Chip>
      <Chip pressed={filters.protocol === "udp"} onClick={() => toggleProtocol("udp")}>
        UDP
      </Chip>
      <Chip
        pressed={filters.exposedOnly}
        onClick={() => set({ exposedOnly: !filters.exposedOnly })}
        title="Only ports that other devices on your network can reach"
      >
        Open to network
      </Chip>
      <Chip
        pressed={filters.showSystem}
        onClick={() => set({ showSystem: !filters.showSystem })}
        title="Ports that belong to Windows itself"
      >
        Windows
        {hiddenSystem > 0 && <span className="chip-count">{hiddenSystem}</span>}
      </Chip>
    </div>
  );
}
