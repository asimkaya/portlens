// Fake data for developing the UI in a browser. Never bundled into the app:
// api.ts only imports this when `import.meta.env.DEV` is true.
import type { Api } from "./api";
import type { ProcessInfo, Snapshot, Socket } from "./types";

const now = Math.floor(Date.now() / 1000);

function proc(
  pid: number,
  name: string,
  exe: string,
  extra: Partial<ProcessInfo> = {},
): ProcessInfo {
  return {
    pid,
    name,
    exe,
    command_line: `"${exe}"`,
    parent_pid: 1000,
    started_at: now - 3600,
    is_system: false,
    protection: "none",
    protection_reason: null,
    services: [],
    ...extra,
  };
}

const system = {
  is_system: true,
  protection: "caution" as const,
  protection_reason: "This Windows process hosts other components. Stopping it can break them.",
};

let processes: ProcessInfo[] = [
  proc(22508, "node.exe", "C:\\Program Files\\nodejs\\node.exe", {
    command_line: "node D:\\code\\shop\\node_modules\\vite\\bin\\vite.js --port 3000",
    started_at: now - 1500,
    parent_pid: 18344,
  }),
  proc(
    9120,
    "python.exe",
    "C:\\Users\\dev\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
    {
      command_line: "python -m http.server 8080 --bind 127.0.0.1",
      started_at: now - 340,
    },
  ),
  proc(5048, "dnscrypt-proxy.exe", "C:\\Tools\\dnscrypt-proxy\\dnscrypt-proxy.exe", {
    started_at: now - 86400 * 3,
  }),
  proc(14012, "postgres.exe", "C:\\Program Files\\PostgreSQL\\16\\bin\\postgres.exe", {
    started_at: now - 86400,
  }),
  proc(31008, "chrome.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"),
  proc(
    7712,
    "Docker Desktop Backend.exe",
    "C:\\Program Files\\Docker\\Docker\\resources\\com.docker.backend.exe",
    {
      started_at: now - 7200,
    },
  ),
  proc(1688, "svchost.exe", "C:\\Windows\\System32\\svchost.exe", {
    ...system,
    services: ["Remote Procedure Call (RPC)"],
  }),
  proc(3784, "svchost.exe", "C:\\Windows\\System32\\svchost.exe", {
    ...system,
    services: ["SSDP Discovery", "UPnP Device Host"],
  }),
  proc(4, "System", "", {
    ...system,
    exe: null,
    command_line: null,
    protection: "locked",
    protection_reason: "Stopping a core Windows process would crash the machine or log you out.",
  }),
];

function listener(local: string, pid: number): Socket {
  return { protocol: "tcp", local, remote: null, state: "listen", pid };
}

function sockets(): Socket[] {
  return [
    listener("0.0.0.0:3000", 22508),
    listener("[::]:3000", 22508),
    listener("127.0.0.1:8080", 9120),
    listener("127.0.0.1:5432", 14012),
    listener("[::1]:5432", 14012),
    listener("0.0.0.0:1080", 7712),
    listener("127.0.0.1:53", 5048),
    { protocol: "udp", local: "127.0.0.1:53", remote: null, state: null, pid: 5048 },
    { protocol: "udp", local: "0.0.0.0:5353", remote: null, state: null, pid: 31008 },
    listener("0.0.0.0:135", 1688),
    listener("[::]:135", 1688),
    { protocol: "udp", local: "192.168.1.102:1900", remote: null, state: null, pid: 3784 },
    { protocol: "udp", local: "[::1]:1900", remote: null, state: null, pid: 3784 },
    listener("0.0.0.0:445", 4),
    {
      protocol: "tcp",
      local: "192.168.1.102:51234",
      remote: "142.250.74.14:443",
      state: "established",
      pid: 31008,
    },
    {
      protocol: "tcp",
      local: "127.0.0.1:5432",
      remote: "127.0.0.1:50122",
      state: "established",
      pid: 14012,
    },
  ];
}

const stopped = new Set<number>();
let tick = 0;

function snapshot(): Snapshot {
  tick++;
  const live = sockets().filter((s) => !stopped.has(s.pid));
  // A short-lived dev server that comes and goes, to exercise the row animations.
  if (Math.floor(tick / 4) % 2 === 1) {
    live.push(listener("0.0.0.0:5173", 9999));
  }
  const byPid: Record<string, ProcessInfo> = {};
  for (const p of [
    ...processes,
    proc(9999, "vite.exe", "D:\\code\\app\\node_modules\\.bin\\vite.exe"),
  ]) {
    byPid[p.pid] = p;
  }
  return { sockets: live, processes: byPid };
}

const delay = <T>(value: T, ms = 40) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

export const mockApi: Api = {
  snapshot: () => delay(snapshot()),
  stopProcess: (pid) => {
    stopped.add(pid);
    processes = processes.filter((p) => p.pid !== pid);
    return delay({ stopped: [pid], failed: [] }, 250);
  },
  isElevated: () => delay(false),
  restartAsAdmin: () => Promise.reject("Administrator permission was not granted."),
  openInBrowser: () => Promise.resolve(),
  hideWindow: () => Promise.resolve(),
  setPinned: () => Promise.resolve(),
  onWindowVisible: () => Promise.resolve(() => {}),
  onSelectPort: () => Promise.resolve(() => {}),
};
