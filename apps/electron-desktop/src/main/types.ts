/** Paths to all bundled/external binaries resolved at bootstrap. */
export type BinaryPaths = {
  gogBin: string;
  jqBin: string;
  memoBin: string;
  remindctlBin: string;
  obsidianCliBin: string;
  ghBin: string;
  whisperCliBin: string;
};

export type GatewayState =
  | { kind: "starting"; port: number; logsDir: string; token: string }
  | { kind: "ready"; port: number; logsDir: string; url: string; token: string }
  | { kind: "failed"; port: number; logsDir: string; details: string; token: string };

export type ResetAndCloseResult = {
  ok: true;
  warnings?: string[];
};
