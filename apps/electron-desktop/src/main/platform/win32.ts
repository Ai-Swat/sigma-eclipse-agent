import type { ChildProcess } from "node:child_process";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { Platform } from "./types";

export class Win32Platform implements Platform {
  readonly name = "win32" as const;
  readonly keepAliveOnAllWindowsClosed = false;
  readonly trayIconIsTemplate = false;

  init(): void {
    patchSpawnForWindows();
  }

  // ── Process management ──────────────────────────────────────────────────

  killProcess(pid: number, _opts?: { force?: boolean }): void {
    // On Windows, process.kill() always terminates unconditionally
    // (there are no Unix signals). The `force` flag is irrelevant.
    process.kill(pid);
  }

  killProcessTree(pid: number): void {
    try {
      execSync(`taskkill /F /PID ${pid} /T`, { stdio: "ignore" });
    } catch {
      // Process may already be dead.
      try {
        process.kill(pid);
      } catch {
        // Already dead.
      }
    }
  }

  killAllByName(name: string): void {
    // Ensure the name ends with .exe for the taskkill image-name filter.
    const imageName = name.endsWith(".exe") ? name : `${name}.exe`;
    try {
      execSync(`taskkill /F /IM ${imageName}`, { stdio: "ignore" });
    } catch {
      // No matching process — expected.
    }
  }

  isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  forceKillChild(child: ChildProcess): void {
    // On Windows, .kill() with no argument terminates the process.
    child.kill();
  }

  // ── Gateway spawn config ────────────────────────────────────────────────

  gatewaySpawnOptions() {
    return {
      // On Windows, detached creates a visible console window and process
      // group kill (-pid) is unsupported; skip both.
      detached: false,
      // --force relies on lsof which is unavailable on Windows.
      extraArgs: [] as string[],
      startupTimeoutMs: 120_000,
    };
  }

  // ── Shell / Terminal ────────────────────────────────────────────────────

  defaultShell(): string {
    return process.env.COMSPEC || "powershell.exe";
  }

  createCliWrapper(params: {
    binDir: string;
    name: string;
    nodeBin: string;
    scriptPath: string;
  }): string {
    const wrapperPath = path.join(params.binDir, `${params.name}.cmd`);
    try {
      fs.unlinkSync(wrapperPath);
    } catch {
      // may not exist
    }
    const isAbsoluteNodeBin = path.isAbsolute(params.nodeBin);
    const nodeCmd = isAbsoluteNodeBin ? params.nodeBin : "node";
    const script = `@echo off\r\n"${nodeCmd}" "${params.scriptPath}" %*\r\n`;
    fs.writeFileSync(wrapperPath, script, "utf-8");
    return wrapperPath;
  }

  // ── Binary paths ────────────────────────────────────────────────────────

  binaryExtension(): string {
    return ".exe";
  }

  ffmpegBinaryName(): string {
    return "ffmpeg.exe";
  }

  ffmpegDownloadUrl(): string | null {
    return "https://github.com/AtomicBot-ai/FFmpeg/releases/download/v8.0.1-1/win-ffmpeg.zip";
  }

  appConfigSearchPaths(appName: string): string[] {
    const paths: string[] = [];
    const appData = process.env.APPDATA;
    if (appData) {
      paths.push(path.join(appData, appName));
    }
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      paths.push(path.join(localAppData, appName));
    }
    paths.push(path.join(os.homedir(), `.config`, appName));
    return paths;
  }

  obsidianConfigPath(): string {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      "obsidian",
      "obsidian.json"
    );
  }

  // ── File system ─────────────────────────────────────────────────────────

  restrictFilePermissions(_filePath: string): void {
    // Windows does not support Unix permission bits; ACLs would be needed
    // for equivalent protection but are out of scope for now.
  }

  makeExecutable(_filePath: string): void {
    // No-op: Windows uses file extensions, not permission bits.
  }

  removeQuarantine(_filePath: string): void {
    // No quarantine attribute on Windows.
  }

  extractZip(zipPath: string, destDir: string): void {
    // Use PowerShell's Expand-Archive which is available on all modern Windows.
    const cmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force"`;
    const res = execSync(cmd, { stdio: "pipe", encoding: "utf-8" });
    if (typeof res === "string" && res.trim()) {
      // Expand-Archive writes errors to stderr, but execSync throws on
      // non-zero exit. If we get here, extraction succeeded.
    }
  }

  // ── Update splash ──────────────────────────────────────────────────────

  showUpdateSplash(_params: { stateDir: string; pid: number; bundleId: string }): void {
    // Windows NSIS installer handles update UX natively.
  }

  killUpdateSplash(_params: { stateDir: string }): void {
    // No splash to kill on Windows.
  }

  // ── Lock file ───────────────────────────────────────────────────────────

  gatewayLockDirSuffix(): string {
    // No uid concept on Windows.
    return "openclaw";
  }
}

// ── Windows spawn patch ─────────────────────────────────────────────────────
// Monkey-patch child_process.spawn / spawnSync to always set
// `windowsHide: true`. Prevents console windows from flashing when
// spawning child processes from the Electron app.

function patchSpawnForWindows(): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cp = require("node:child_process");

  const originalSpawn = cp.spawn;
  cp.spawn = function patchedSpawn(command: string, ...rest: unknown[]): unknown {
    const args = normalizeSpawnArgs(rest);
    if (args.options) {
      args.options.windowsHide = true;
    }
    return args.hasArgs
      ? originalSpawn.call(this, command, args.argv, args.options)
      : originalSpawn.call(this, command, args.options);
  };

  const originalSpawnSync = cp.spawnSync;
  cp.spawnSync = function patchedSpawnSync(command: string, ...rest: unknown[]): unknown {
    const args = normalizeSpawnArgs(rest);
    if (args.options) {
      args.options.windowsHide = true;
    }
    return args.hasArgs
      ? originalSpawnSync.call(this, command, args.argv, args.options)
      : originalSpawnSync.call(this, command, args.options);
  };

  const originalExecFile = cp.execFile;
  cp.execFile = function patchedExecFile(file: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecFile.call(this, file, ...rest);
  };

  const originalExecFileSync = cp.execFileSync;
  cp.execFileSync = function patchedExecFileSync(file: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecFileSync.call(this, file, ...rest);
  };

  const originalExecSync = cp.execSync;
  cp.execSync = function patchedExecSync(command: string, ...rest: unknown[]): unknown {
    for (const arg of rest) {
      if (arg && typeof arg === "object" && !Array.isArray(arg)) {
        (arg as Record<string, unknown>).windowsHide = true;
        break;
      }
    }
    return originalExecSync.call(this, command, ...rest);
  };
}

function normalizeSpawnArgs(rest: unknown[]): {
  hasArgs: boolean;
  argv: unknown;
  options: Record<string, unknown>;
} {
  if (rest.length === 0) {
    const opts: Record<string, unknown> = {};
    return { hasArgs: false, argv: undefined, options: opts };
  }

  if (Array.isArray(rest[0])) {
    const argv = rest[0];
    const opts = rest[1] && typeof rest[1] === "object" ? (rest[1] as Record<string, unknown>) : {};
    if (!rest[1]) {
      rest[1] = opts;
    }
    return { hasArgs: true, argv, options: opts };
  }

  if (rest[0] && typeof rest[0] === "object") {
    return {
      hasArgs: false,
      argv: undefined,
      options: rest[0] as Record<string, unknown>,
    };
  }

  const opts: Record<string, unknown> = {};
  return { hasArgs: false, argv: undefined, options: opts };
}
