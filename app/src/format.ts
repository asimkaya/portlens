const UNITS: [limit: number, seconds: number, name: string][] = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86_400, 3600, "hour"],
  [Infinity, 86_400, "day"],
];

/** "3 hours ago", relative to `now` (milliseconds). */
export function formatAge(startedAtSeconds: number, now = Date.now()): string {
  const elapsed = Math.max(0, Math.floor(now / 1000 - startedAtSeconds));
  if (elapsed < 5) return "just now";

  const [, size, name] = UNITS.find(([limit]) => elapsed < limit)!;
  const count = Math.floor(elapsed / size);
  return `${count} ${name}${count === 1 ? "" : "s"} ago`;
}

export function folderOf(path: string): string {
  const cut = path.lastIndexOf("\\");
  return cut > 0 ? path.slice(0, cut) : path;
}

/** A stable hue (0-359) so a process keeps its avatar colour between runs. */
export function hueOf(name: string): number {
  let hash = 0;
  for (const char of name.toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}
