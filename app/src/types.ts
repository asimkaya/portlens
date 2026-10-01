// Mirrors the JSON produced by portlens-core. Field names stay snake_case
// because that is what serde emits.

export type Protocol = "tcp" | "udp";

export type TcpState =
  | "closed"
  | "listen"
  | "syn_sent"
  | "syn_received"
  | "established"
  | "fin_wait1"
  | "fin_wait2"
  | "close_wait"
  | "closing"
  | "last_ack"
  | "time_wait"
  | "delete_tcb";

export interface Socket {
  protocol: Protocol;
  /** `127.0.0.1:3000` or `[::1]:3000`, with an optional `%scope` on IPv6. */
  local: string;
  remote: string | null;
  state: TcpState | null;
  pid: number;
}

export type Protection = "none" | "caution" | "locked";

export interface ProcessInfo {
  pid: number;
  name: string;
  exe: string | null;
  command_line: string | null;
  parent_pid: number | null;
  /** Seconds since the Unix epoch. */
  started_at: number | null;
  is_system: boolean;
  protection: Protection;
  protection_reason: string | null;
  services: string[];
}

export interface Snapshot {
  sockets: Socket[];
  processes: Record<string, ProcessInfo>;
}

export interface StopReport {
  stopped: number[];
  failed: { pid: number; message: string }[];
}
