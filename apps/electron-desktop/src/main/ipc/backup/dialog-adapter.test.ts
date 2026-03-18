import { app, dialog } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBackupDefaultFileName,
  showBackupSaveDialog,
  showOpenclawFolderDialog,
} from "./dialog-adapter";

describe("backup dialog adapter", () => {
  beforeEach(() => {
    vi.mocked(dialog.showSaveDialog).mockReset();
    vi.mocked(dialog.showOpenDialog).mockReset();
    vi.mocked(app.getPath).mockImplementation((name: string) => `/mock/${name}`);
  });

  it("builds deterministic backup filename", () => {
    const file = buildBackupDefaultFileName(new Date(2026, 2, 2, 8, 9, 7));
    expect(file).toBe("sigma-eclipse-backup-2026-03-02-080907.zip");
  });

  it("opens save dialog with default backup path", async () => {
    await showBackupSaveDialog(null);
    expect(dialog.showSaveDialog).toHaveBeenCalledTimes(1);
    const options = vi.mocked(dialog.showSaveDialog).mock.calls[0]?.[0] as { defaultPath: string };
    expect(options.defaultPath).toContain("/mock/documents/sigma-eclipse-backup-");
    expect(options.defaultPath.endsWith(".zip")).toBe(true);
  });

  it("opens folder picker with openDirectory option", async () => {
    await showOpenclawFolderDialog(null);
    const options = vi.mocked(dialog.showOpenDialog).mock.calls[0]?.[0] as {
      properties: string[];
    };
    expect(options.properties).toEqual(["openDirectory"]);
  });
});
