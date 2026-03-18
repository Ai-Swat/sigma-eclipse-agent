/**
 * Update splash — thin wrapper around the platform abstraction.
 *
 * On macOS: spawns a native JXA floating window that persists across restarts.
 * On other platforms: no-op (the OS installer handles update UX).
 */

import { app } from "electron";
import * as path from "node:path";

import { getPlatform } from "./platform";

/**
 * Show the native update splash window.
 *
 * Should be called immediately before `autoUpdater.quitAndInstall()`. The
 * splash runs as a detached process that survives the Electron quit.
 */
export function showUpdateSplash(): void {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const stateDir = path.join(app.getPath("userData"), "openclaw");
    getPlatform().showUpdateSplash({
      stateDir,
      pid: process.pid,
      bundleId: "ai.sigmaeclipse.desktop",
    });
  } catch (err) {
    console.warn("[update-splash] showUpdateSplash failed:", err);
  }
}

/**
 * Kill a lingering update splash (if any).
 *
 * Call this early during app startup so the splash disappears as soon as the
 * new app instance is alive.
 */
export function killUpdateSplash(): void {
  if (process.platform !== "darwin") {
    return;
  }
  try {
    const stateDir = path.join(app.getPath("userData"), "openclaw");
    getPlatform().killUpdateSplash({ stateDir });
  } catch (err) {
    console.warn("[update-splash] killUpdateSplash failed:", err);
  }
}
