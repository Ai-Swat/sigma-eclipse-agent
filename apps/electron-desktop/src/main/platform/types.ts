import type { ChildProcess } from "node:child_process";

/**
 * Platform abstraction interface.
 *
 * Each platform (darwin, win32, linux) implements this contract so that
 * consumer code never contains inline `process.platform` checks.
 */
export interface Platform {
  readonly name: "darwin" | "win32" | "linux";

  // ── Lifecycle ───────────────────────────────────────────────────────────
  /**
   * One-time platform-specific initialisation (e.g. monkey-patching spawn
   * on Windows). Called automatically by the factory on first access.
   */
  init(): void;

  // ── Process management ──────────────────────────────────────────────────
  /** Kill a single process. Graceful by default; force = unconditional. */
  killProcess(pid: number, opts?: { force?: boolean }): void;

  /** Kill the entire process tree rooted at `pid`. */
  killProcessTree(pid: number): void;

  /** Kill all OS processes whose binary name matches `name`. */
  killAllByName(name: string): void;

  /** Return true when the process with `pid` is still running. */
  isProcessAlive(pid: number): boolean;

  /** Force-kill a ChildProcess instance. */
  forceKillChild(child: ChildProcess): void;

  // ── Gateway spawn config ────────────────────────────────────────────────
  gatewaySpawnOptions(): {
    detached: boolean;
    extraArgs: string[];
    startupTimeoutMs: number;
  };

  // ── Shell / Terminal ────────────────────────────────────────────────────
  /** Default interactive shell binary (e.g. "/bin/sh", "powershell.exe"). */
  defaultShell(): string;

  /**
   * Create a small wrapper script so the user can type `<name> <args>`
   * in the embedded terminal. Returns the path to the created file.
   */
  createCliWrapper(params: {
    binDir: string;
    name: string;
    nodeBin: string;
    scriptPath: string;
  }): string;

  // ── Binary paths ────────────────────────────────────────────────────────
  /** File extension for executables ("" on Unix, ".exe" on Windows). */
  binaryExtension(): string;

  /** Platform-specific ffmpeg binary filename. */
  ffmpegBinaryName(): string;

  /** Download URL for a pre-built ffmpeg binary, or null when unavailable. */
  ffmpegDownloadUrl(): string | null;

  /** Ordered list of directories where `appName` may store its config. */
  appConfigSearchPaths(appName: string): string[];

  /** Absolute path to Obsidian's obsidian.json config file. */
  obsidianConfigPath(): string;

  // ── File system ─────────────────────────────────────────────────────────
  /** Best-effort owner-only read/write permissions (chmod 0o600). */
  restrictFilePermissions(filePath: string): void;

  /** Best-effort make-executable (chmod 0o755). */
  makeExecutable(filePath: string): void;

  /** Remove OS-level quarantine flag (macOS xattr; no-op elsewhere). */
  removeQuarantine(filePath: string): void;

  /** Extract a .zip archive into `destDir`. */
  extractZip(zipPath: string, destDir: string): void;

  // ── Electron app lifecycle ──────────────────────────────────────────────
  /** Whether the app should stay alive when all windows are closed. */
  readonly keepAliveOnAllWindowsClosed: boolean;

  /** Whether the tray icon should be set as a template image. */
  readonly trayIconIsTemplate: boolean;

  /** Show a native update-splash screen that survives app restart. */
  showUpdateSplash(params: { stateDir: string; pid: number; bundleId: string }): void;

  /** Kill a lingering update-splash screen from a previous launch. */
  killUpdateSplash(params: { stateDir: string }): void;

  // ── Lock file ───────────────────────────────────────────────────────────
  /** Subdirectory name inside os.tmpdir() for gateway lock files. */
  gatewayLockDirSuffix(): string;
}
