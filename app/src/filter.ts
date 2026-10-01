import type { Row } from "./rows";

export interface Filters {
  query: string;
  scope: "listening" | "all";
  protocol: "any" | "tcp" | "udp";
  exposedOnly: boolean;
  showSystem: boolean;
}

export const defaultFilters: Filters = {
  query: "",
  scope: "listening",
  protocol: "any",
  exposedOnly: false,
  showSystem: false,
};

function haystack(row: Row): string {
  const { process } = row;
  return [
    row.port,
    row.protocol,
    row.addresses.join(" "),
    row.remote ?? "",
    process.name,
    process.pid,
    process.exe ?? "",
    process.services.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}

/** Every whitespace-separated word must match. `:80` matches port 80 exactly,
 * so it does not also match 8080. */
function matchesQuery(row: Row, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;

  const text = haystack(row);
  return words.every((word) =>
    word.startsWith(":") && word.length > 1
      ? String(row.port) === word.slice(1)
      : text.includes(word),
  );
}

function matchesExceptSystem(row: Row, filters: Filters): boolean {
  if (filters.scope === "listening" && !row.listening) return false;
  if (filters.protocol !== "any" && row.protocol !== filters.protocol) return false;
  if (filters.exposedOnly && !row.exposed) return false;
  return matchesQuery(row, filters.query);
}

export function applyFilters(rows: Row[], filters: Filters): Row[] {
  return rows.filter(
    (row) => matchesExceptSystem(row, filters) && (filters.showSystem || !row.process.is_system),
  );
}

/** How many rows the "Windows processes" switch is currently hiding. */
export function countHiddenSystem(rows: Row[], filters: Filters): number {
  if (filters.showSystem) return 0;
  return rows.filter((row) => row.process.is_system && matchesExceptSystem(row, filters)).length;
}

export function sortRows(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => a.port - b.port || a.protocol.localeCompare(b.protocol));
}
