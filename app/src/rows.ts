import type { ProcessInfo, Protocol, Snapshot, Socket, TcpState } from "./types";

/** One line in the list. Listening sockets of the same process and port are
 * merged, so a server bound to both `0.0.0.0` and `::` shows up once. */
export interface Row {
  key: string;
  protocol: Protocol;
  port: number;
  addresses: string[];
  /** Only for connections that are not listening. */
  remote: string | null;
  state: TcpState | null;
  listening: boolean;
  /** Reachable from other machines, as opposed to loopback only. */
  exposed: boolean;
  process: ProcessInfo;
}

export function splitAddress(address: string): { host: string; port: number } {
  const colon = address.lastIndexOf(":");
  let host = address.slice(0, colon);
  if (host.startsWith("[")) host = host.slice(1, -1);
  // `fe80::1%12`: the zone index only matters to the OS.
  host = host.replace(/%.*$/, "");
  return { host, port: Number(address.slice(colon + 1)) };
}

export function isLoopback(host: string): boolean {
  return host === "::1" || host.startsWith("127.");
}

export function isWildcard(host: string): boolean {
  return host === "0.0.0.0" || host === "::";
}

function isListening(socket: Socket): boolean {
  return socket.protocol === "udp" || socket.state === "listen";
}

function unknownProcess(pid: number): ProcessInfo {
  return {
    pid,
    name: "Unknown",
    exe: null,
    command_line: null,
    parent_pid: null,
    started_at: null,
    is_system: false,
    protection: "none",
    protection_reason: null,
    services: [],
  };
}

export function toRows(snapshot: Snapshot): Row[] {
  const rows = new Map<string, Row>();

  for (const socket of snapshot.sockets) {
    const local = splitAddress(socket.local);
    const listening = isListening(socket);
    const key = listening
      ? `${socket.protocol}|${local.port}|${socket.pid}|${socket.state}`
      : `${socket.protocol}|${socket.local}|${socket.remote}|${socket.pid}`;

    const existing = rows.get(key);
    if (existing) {
      if (!existing.addresses.includes(local.host)) existing.addresses.push(local.host);
      existing.exposed ||= !isLoopback(local.host);
      continue;
    }

    rows.set(key, {
      key,
      protocol: socket.protocol,
      port: local.port,
      addresses: [local.host],
      remote: socket.remote,
      state: socket.state,
      listening,
      exposed: !isLoopback(local.host),
      process: snapshot.processes[socket.pid] ?? unknownProcess(socket.pid),
    });
  }

  return [...rows.values()];
}

/** Short, human description of where a row is bound. */
export function describeBinding(row: Row): string {
  if (!row.listening && row.remote) {
    return `${row.addresses[0]} → ${row.remote}`;
  }
  if (row.addresses.some(isWildcard)) return "All interfaces";
  if (row.addresses.every(isLoopback)) return "This computer only";
  const [first, ...rest] = row.addresses;
  return rest.length ? `${first} +${rest.length}` : first;
}

const STATE_LABELS: Record<TcpState, string> = {
  closed: "Closed",
  listen: "Listening",
  syn_sent: "Connecting",
  syn_received: "Connecting",
  established: "Connected",
  fin_wait1: "Closing",
  fin_wait2: "Closing",
  close_wait: "Closing",
  closing: "Closing",
  last_ack: "Closing",
  time_wait: "Waiting",
  delete_tcb: "Closed",
};

export function describeState(row: Row): string {
  if (row.protocol === "udp") return "Listening";
  return row.state ? STATE_LABELS[row.state] : "Unknown";
}
