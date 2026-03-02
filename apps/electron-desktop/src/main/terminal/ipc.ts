import { ipcMain, type BrowserWindow } from "electron";

import type { BinaryPaths } from "../types";
import { IPC } from "../../shared/ipc-channels";
import {
  createTerminal,
  writeTerminal,
  resizeTerminal,
  killTerminal,
  listTerminals,
  getTerminalBuffer,
  type CreateTerminalParams,
} from "./pty-manager";

/**
 * Register IPC handlers for the embedded terminal (multi-session PTY).
 */
export function registerTerminalIpcHandlers(
  params: Partial<BinaryPaths> & {
    getMainWindow: () => BrowserWindow | null;
    stateDir: string;
    openclawDir: string;
    nodeBin: string;
  }
) {
  const baseParams: CreateTerminalParams = {
    getMainWindow: params.getMainWindow,
    stateDir: params.stateDir,
    openclawDir: params.openclawDir,
    nodeBin: params.nodeBin,
    gogBin: params.gogBin,
    jqBin: params.jqBin,
    memoBin: params.memoBin,
    remindctlBin: params.remindctlBin,
    obsidianCliBin: params.obsidianCliBin,
    ghBin: params.ghBin,
  };

  ipcMain.handle(IPC.terminalCreate, async () => {
    return createTerminal(baseParams);
  });

  ipcMain.handle(IPC.terminalWrite, async (_evt, p: { id?: unknown; data?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    const data = typeof p?.data === "string" ? p.data : "";
    if (id && data) {
      writeTerminal(id, data);
    }
  });

  ipcMain.handle(
    IPC.terminalResize,
    async (_evt, p: { id?: unknown; cols?: unknown; rows?: unknown }) => {
      const id = typeof p?.id === "string" ? p.id : "";
      const cols = typeof p?.cols === "number" ? p.cols : 80;
      const rows = typeof p?.rows === "number" ? p.rows : 24;
      if (id) {
        resizeTerminal(id, cols, rows);
      }
    }
  );

  ipcMain.handle(IPC.terminalKill, async (_evt, p: { id?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    if (id) {
      killTerminal(id);
    }
  });

  ipcMain.handle(IPC.terminalList, async () => {
    return listTerminals();
  });

  ipcMain.handle(IPC.terminalGetBuffer, async (_evt, p: { id?: unknown }) => {
    const id = typeof p?.id === "string" ? p.id : "";
    if (!id) {
      return "";
    }
    return getTerminalBuffer(id);
  });
}
