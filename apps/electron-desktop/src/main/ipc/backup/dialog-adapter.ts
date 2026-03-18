import { app, dialog, type BrowserWindow } from "electron";
import path from "node:path";

export function buildBackupDefaultFileName(now = new Date()): string {
  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return `sigma-eclipse-backup-${datePart}-${timePart}.zip`;
}

export async function showBackupSaveDialog(parentWindow: BrowserWindow | null) {
  const dialogOpts = {
    title: "Save OpenClaw Backup",
    defaultPath: path.join(app.getPath("documents"), buildBackupDefaultFileName()),
    filters: [{ name: "ZIP Archives", extensions: ["zip"] }],
  };
  return parentWindow
    ? dialog.showSaveDialog(parentWindow, dialogOpts)
    : dialog.showSaveDialog(dialogOpts);
}

export async function showOpenclawFolderDialog(parentWindow: BrowserWindow | null) {
  const dialogOpts = {
    title: "Select OpenClaw Configuration Folder",
    properties: ["openDirectory"] as Array<"openDirectory">,
  };
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, dialogOpts)
    : dialog.showOpenDialog(dialogOpts);
}
