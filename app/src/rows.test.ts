import { describe, expect, it } from "vitest";
import { applyFilters, countHiddenSystem, defaultFilters, sortRows } from "./filter";
import { describeBinding, splitAddress, toRows } from "./rows";
import type { ProcessInfo, Snapshot, Socket } from "./types";

function process(pid: number, name: string, overrides: Partial<ProcessInfo> = {}): ProcessInfo {
  return {
    pid,
    name,
    exe: `C:\\Apps\\${name}`,
    command_line: null,
    parent_pid: null,
    started_at: null,
    is_system: false,
    protection: "none",
    protection_reason: null,
    services: [],
    ...overrides,
  };
}

function tcpListener(local: string, pid: number): Socket {
  return { protocol: "tcp", local, remote: null, state: "listen", pid };
}

const snapshot: Snapshot = {
  sockets: [
    tcpListener("0.0.0.0:3000", 10),
    tcpListener("[::]:3000", 10),
    tcpListener("127.0.0.1:8080", 20),
    tcpListener("0.0.0.0:135", 30),
    {
      protocol: "tcp",
      local: "10.0.0.5:51000",
      remote: "1.2.3.4:443",
      state: "established",
      pid: 20,
    },
  ],
  processes: {
    10: process(10, "node.exe"),
    20: process(20, "python.exe"),
    30: process(30, "svchost.exe", { is_system: true, services: ["RPC Endpoint Mapper"] }),
  },
};

describe("splitAddress", () => {
  it("handles IPv4, IPv6 and zone indexes", () => {
    expect(splitAddress("127.0.0.1:3000")).toEqual({ host: "127.0.0.1", port: 3000 });
    expect(splitAddress("[::1]:53")).toEqual({ host: "::1", port: 53 });
    expect(splitAddress("[fe80::1%12]:1900")).toEqual({ host: "fe80::1", port: 1900 });
  });
});

describe("toRows", () => {
  const rows = toRows(snapshot);

  it("merges the IPv4 and IPv6 listeners of one server", () => {
    const node = rows.filter((r) => r.process.pid === 10);
    expect(node).toHaveLength(1);
    expect(node[0].addresses).toEqual(["0.0.0.0", "::"]);
    expect(describeBinding(node[0])).toBe("All interfaces");
  });

  it("keeps separate connections apart", () => {
    expect(rows.filter((r) => !r.listening)).toHaveLength(1);
  });

  it("marks loopback-only listeners as not exposed", () => {
    const python = rows.find((r) => r.port === 8080)!;
    expect(python.exposed).toBe(false);
    expect(describeBinding(python)).toBe("This computer only");
  });
});

describe("filters", () => {
  const rows = toRows(snapshot);

  it("hides Windows processes and connections by default", () => {
    const shown = applyFilters(rows, defaultFilters).map((r) => r.port);
    expect(shown).toEqual([3000, 8080]);
  });

  it("counts what the Windows switch is hiding", () => {
    expect(countHiddenSystem(rows, defaultFilters)).toBe(1);
    expect(countHiddenSystem(rows, { ...defaultFilters, showSystem: true })).toBe(0);
  });

  it("matches words across process and port", () => {
    const shown = applyFilters(rows, { ...defaultFilters, query: "node 30" });
    expect(shown.map((r) => r.port)).toEqual([3000]);
  });

  it("treats :port as an exact match", () => {
    const all = { ...defaultFilters, showSystem: true, query: ":80" };
    expect(applyFilters(rows, all)).toHaveLength(0);
    expect(applyFilters(rows, { ...all, query: ":8080" })).toHaveLength(1);
  });

  it("searches hosted service names", () => {
    const all = { ...defaultFilters, showSystem: true, query: "endpoint mapper" };
    expect(applyFilters(rows, all).map((r) => r.port)).toEqual([135]);
  });

  it("keeps only exposed listeners on request", () => {
    const shown = applyFilters(rows, { ...defaultFilters, exposedOnly: true });
    expect(shown.map((r) => r.port)).toEqual([3000]);
  });
});

describe("sortRows", () => {
  it("sorts by port, then protocol", () => {
    const rows = toRows(snapshot);
    const sorted = sortRows(rows, { key: "port", direction: "desc" });
    expect(sorted[0].port).toBe(51000);
  });
});
