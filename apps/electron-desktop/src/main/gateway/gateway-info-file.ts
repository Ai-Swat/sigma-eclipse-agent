/**
 * Writes/removes a `gateway-info.json` file to the shared data directory
 * (`com.sigma-eclipse.llm`) so that the native messaging host (and hence
 * the browser extension) can discover the gateway's connection parameters.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { GatewayState } from "../types";

const INFO_FILENAME = "gateway-info.json";

export interface GatewayInfoOnDisk {
  url: string;
  port: number;
  token: string;
  ready: boolean;
}

/**
 * Platform-specific shared data directory used by the native messaging host.
 * Must stay in sync with `getAppDataDir()` in the native host binary.
 */
function getSharedDataDir(): string {
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

function getInfoPath(): string {
  return path.join(getSharedDataDir(), INFO_FILENAME);
}

export function writeGatewayInfoFile(gwState: GatewayState): void {
  const info: GatewayInfoOnDisk = {
    url: gwState.kind === "ready" ? gwState.url : `http://127.0.0.1:${gwState.port}/`,
    port: gwState.port,
    token: gwState.token,
    ready: gwState.kind === "ready",
  };

  try {
    const dir = getSharedDataDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(getInfoPath(), JSON.stringify(info, null, 2), "utf-8");
  } catch (err) {
    console.warn("[gateway-info-file] write failed:", err);
  }
}

export function removeGatewayInfoFile(): void {
  try {
    fs.unlinkSync(getInfoPath());
  } catch {
    // File may not exist — that's fine.
  }
}
