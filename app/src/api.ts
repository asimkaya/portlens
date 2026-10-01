import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Protocol, Snapshot, StopReport } from "./types";

export interface Api {
  snapshot(): Promise<Snapshot>;
  stopProcess(pid: number, startedAt: number | null, tree: boolean): Promise<StopReport>;
  isElevated(): Promise<boolean>;
  restartAsAdmin(): Promise<void>;
  openInBrowser(port: number): Promise<void>;
  hideWindow(): Promise<void>;
  /** A pinned window stays open when it loses focus. */
  setPinned(pinned: boolean): Promise<void>;
  /** Fires when the window is hidden to, or restored from, the tray. */
  onWindowVisible(callback: (visible: boolean) => void): Promise<() => void>;
  /** Fires when a port is picked from the tray menu. */
  onSelectPort(callback: (selection: PortSelection) => void): Promise<() => void>;
}

export interface PortSelection {
  port: number;
  protocol: Protocol;
  pid: number;
}

const tauriApi: Api = {
  snapshot: () => invoke("snapshot"),
  stopProcess: (pid, startedAt, tree) => invoke("stop_process", { pid, startedAt, tree }),
  isElevated: () => invoke("is_elevated"),
  restartAsAdmin: () => invoke("restart_as_admin"),
  openInBrowser: (port) => invoke("open_in_browser", { port }),
  hideWindow: () => invoke("hide_window"),
  setPinned: (pinned) => invoke("set_pinned", { pinned }),
  onWindowVisible: (callback) => listen<boolean>("window-visible", (e) => callback(e.payload)),
  onSelectPort: (callback) => listen<PortSelection>("select-port", (e) => callback(e.payload)),
};

async function pickApi(): Promise<Api> {
  if ("__TAURI_INTERNALS__" in window) return tauriApi;
  // Lets the UI be developed in a plain browser with `npm run dev`.
  if (import.meta.env.DEV) return (await import("./mock")).mockApi;
  throw new Error("Portlens has to run inside its desktop shell.");
}

export const api: Api = await pickApi();

/** Tauri rejects with the plain message string produced by the Rust side. */
export function messageOf(error: unknown): string {
  return typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : "Something went wrong.";
}
