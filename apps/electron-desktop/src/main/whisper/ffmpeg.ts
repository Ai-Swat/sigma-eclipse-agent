import * as fs from "node:fs";
import * as path from "node:path";

import { getPlatform } from "../platform";
import { downloadFile } from "./download";

/** ffmpeg binary lives inside the persistent whisper data directory. */
export function resolveFfmpegPath(whisperDataDir: string): string {
  return path.join(whisperDataDir, getPlatform().ffmpegBinaryName());
}

/**
 * Download and extract ffmpeg if not already present in the whisper data dir.
 * Returns the path to the ffmpeg binary.
 */
export async function ensureFfmpeg(whisperDataDir: string): Promise<string> {
  const platform = getPlatform();
  const ffmpegPath = resolveFfmpegPath(whisperDataDir);
  if (fs.existsSync(ffmpegPath)) {
    return ffmpegPath;
  }

  const downloadUrl = platform.ffmpegDownloadUrl();
  if (!downloadUrl) {
    throw new Error(`ffmpeg download not available for platform: ${platform.name}`);
  }

  console.log("[whisper] ffmpeg not found, downloading…");
  fs.mkdirSync(whisperDataDir, { recursive: true });

  const zipPath = path.join(whisperDataDir, "ffmpeg-download.zip");
  try {
    await downloadFile(downloadUrl, zipPath);

    const extractDir = path.join(whisperDataDir, "_ffmpeg_extract");
    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    fs.mkdirSync(extractDir, { recursive: true });

    platform.extractZip(zipPath, extractDir);

    const extractedBin = path.join(extractDir, platform.ffmpegBinaryName());
    if (!fs.existsSync(extractedBin)) {
      throw new Error(`ffmpeg binary not found in extracted archive`);
    }

    fs.copyFileSync(extractedBin, ffmpegPath);
    platform.makeExecutable(ffmpegPath);
    platform.removeQuarantine(ffmpegPath);

    try {
      fs.rmSync(extractDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {
      /* ignore */
    }

    console.log(`[whisper] ffmpeg installed at: ${ffmpegPath}`);
    return ffmpegPath;
  } catch (err) {
    try {
      fs.rmSync(zipPath, { force: true });
    } catch {
      /* ignore */
    }
    throw err;
  }
}
