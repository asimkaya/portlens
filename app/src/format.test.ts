import { describe, expect, it } from "vitest";
import { folderOf, formatAge, hueOf } from "./format";

describe("formatAge", () => {
  const now = 1_700_000_000_000;
  const ago = (seconds: number) => formatAge(now / 1000 - seconds, now);

  it("uses the largest fitting unit", () => {
    expect(ago(2)).toBe("just now");
    expect(ago(59)).toBe("59 seconds ago");
    expect(ago(60)).toBe("1 minute ago");
    expect(ago(7200)).toBe("2 hours ago");
    expect(ago(3 * 86_400)).toBe("3 days ago");
  });
});

describe("folderOf", () => {
  it("drops the file name", () => {
    expect(folderOf("C:\\Program Files\\nodejs\\node.exe")).toBe("C:\\Program Files\\nodejs");
  });
});

describe("hueOf", () => {
  it("is stable and case-insensitive", () => {
    expect(hueOf("Chrome.exe")).toBe(hueOf("chrome.exe"));
    expect(hueOf("node.exe")).toBeGreaterThanOrEqual(0);
    expect(hueOf("node.exe")).toBeLessThan(360);
  });
});
