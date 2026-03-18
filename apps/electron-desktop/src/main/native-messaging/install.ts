/**
 * Installs the Chrome Native Messaging manifest for com.sigma_eclipse.agent
 * so the browser extension can discover and communicate with the gateway.
 */

import { app } from "electron";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execSync } from "node:child_process";

const HOST_NAME = "com.sigma_eclipse.agent";
const EXTENSION_ID = process.env.SIGMA_EXTENSION_ID || "ebihdmcdigelnhlkapdcmgdjaieebidk";

// ---------------------------------------------------------------------------
// Resolve the host executable path
// ---------------------------------------------------------------------------

function resolveHostScriptPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "native-messaging-host.js");
  }
  // Dev: app.getAppPath() = apps/electron-desktop, dist/ is inside it
  return path.join(app.getAppPath(), "dist", "native-messaging-host.js");
}

function resolveNodeBin(): string {
  if (app.isPackaged) {
    const base = path.join(process.resourcesPath, "node", `${process.platform}-${process.arch}`);
    return process.platform === "win32"
      ? path.join(base, "node.exe")
      : path.join(base, "bin", "node");
  }
  // In dev, process.execPath is the Electron binary — can't use it for a
  // headless Node.js script. Resolve the absolute path to system node so the
  // wrapper works even when Chrome spawns it with a minimal PATH (no nvm/brew).
  if (process.env.OPENCLAW_DESKTOP_NODE_BIN?.trim()) {
    return process.env.OPENCLAW_DESKTOP_NODE_BIN.trim();
  }
  try {
    const cmd = process.platform === "win32" ? "where node" : "which node";
    return execSync(cmd, { encoding: "utf-8" }).trim();
  } catch {
    return "node";
  }
}

/**
 * On macOS/Linux the manifest `path` must point to an executable file.
 * We generate a small shell wrapper that launches the JS host with the
 * bundled (or dev) Node binary.
 */
function resolveHostExecutablePath(): string {
  const sharedDir = getSharedDir();
  if (process.platform === "win32") {
    return path.join(sharedDir, "sigma-eclipse-agent-host.bat");
  }
  return path.join(sharedDir, "sigma-eclipse-agent-host");
}

function getSharedDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(os.homedir(), "Library", "Application Support", "com.sigma-eclipse.llm");
    case "win32": {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      return path.join(appData, "com.sigma-eclipse.llm");
    }
    default:
      return path.join(
        process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"),
        "com.sigma-eclipse.llm"
      );
  }
}

function writeHostWrapper(): string {
  const nodeBin = resolveNodeBin();
  const scriptPath = resolveHostScriptPath();
  const wrapperPath = resolveHostExecutablePath();
  const dir = path.dirname(wrapperPath);

  fs.mkdirSync(dir, { recursive: true });

  if (process.platform === "win32") {
    fs.writeFileSync(wrapperPath, `@echo off\r\n"${nodeBin}" "${scriptPath}" %*\r\n`, "utf-8");
  } else {
    fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec "${nodeBin}" "${scriptPath}" "$@"\n`, "utf-8");
    fs.chmodSync(wrapperPath, 0o755);
  }

  return wrapperPath;
}

// ---------------------------------------------------------------------------
// Manifest directories per browser
// ---------------------------------------------------------------------------

function getChromeNativeHostsDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Google",
        "Chrome",
        "NativeMessagingHosts"
      );
    case "win32": {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      return path.join(localAppData, "Google", "Chrome", "NativeMessagingHosts");
    }
    default:
      return path.join(os.homedir(), ".config", "google-chrome", "NativeMessagingHosts");
  }
}

function getChromiumNativeHostsDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Chromium",
        "NativeMessagingHosts"
      );
    case "win32": {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      return path.join(localAppData, "Chromium", "NativeMessagingHosts");
    }
    default:
      return path.join(os.homedir(), ".config", "chromium", "NativeMessagingHosts");
  }
}

function getSigmaNativeHostsDir(): string {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Sigma",
        "NativeMessagingHosts"
      );
    case "win32": {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
      return path.join(localAppData, "Sigma", "NativeMessagingHosts");
    }
    default:
      return path.join(os.homedir(), ".config", "sigma", "NativeMessagingHosts");
  }
}

// ---------------------------------------------------------------------------
// Manifest generation & installation
// ---------------------------------------------------------------------------

function generateManifest(hostExecutablePath: string): string {
  return JSON.stringify(
    {
      name: HOST_NAME,
      description: "Sigma Eclipse Agent — Gateway Native Messaging Host",
      path: hostExecutablePath,
      type: "stdio",
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    },
    null,
    2
  );
}

function installManifestToDir(hostsDir: string, content: string): void {
  fs.mkdirSync(hostsDir, { recursive: true });
  const manifestPath = path.join(hostsDir, `${HOST_NAME}.json`);
  fs.writeFileSync(manifestPath, content, "utf-8");
  console.info(`[native-messaging] Installed manifest: ${manifestPath}`);
}

function installWindowsRegistry(manifestPath: string): void {
  const registryPaths = [
    `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`,
    `HKCU\\Software\\Chromium\\NativeMessagingHosts\\${HOST_NAME}`,
  ];

  for (const regPath of registryPaths) {
    try {
      execSync(`reg add "${regPath}" /ve /t REG_SZ /d "${manifestPath}" /f`, {
        windowsHide: true,
      });
      console.info(`[native-messaging] Registered: ${regPath}`);
    } catch (e) {
      console.warn(`[native-messaging] Failed to register ${regPath}:`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function installAgentNativeMessaging(): void {
  console.info("[native-messaging] Installing agent native messaging host...");

  try {
    const wrapperPath = writeHostWrapper();
    const manifest = generateManifest(wrapperPath);

    installManifestToDir(getChromeNativeHostsDir(), manifest);
    installManifestToDir(getChromiumNativeHostsDir(), manifest);
    installManifestToDir(getSigmaNativeHostsDir(), manifest);

    if (process.platform === "win32") {
      const chromeManifest = path.join(getChromeNativeHostsDir(), `${HOST_NAME}.json`);
      installWindowsRegistry(chromeManifest);
    }

    console.info("[native-messaging] Installation complete");
  } catch (e) {
    console.warn("[native-messaging] Installation failed:", e);
  }
}
