import { parseRoleRef } from "./pw-role-snapshot.js";

let nextUploadArmId = 0;
let nextDialogArmId = 0;
let nextDownloadArmId = 0;

export function bumpUploadArmId(): number {
  nextUploadArmId += 1;
  return nextUploadArmId;
}

export function bumpDialogArmId(): number {
  nextDialogArmId += 1;
  return nextDialogArmId;
}

export function bumpDownloadArmId(): number {
  nextDownloadArmId += 1;
  return nextDownloadArmId;
}

export function requireRef(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const roleRef = raw ? parseRoleRef(raw) : null;
  const ref = roleRef ?? (raw.startsWith("@") ? raw.slice(1) : raw);
  if (!ref) {
    throw new Error("ref is required");
  }
  return ref;
}

export function requireRefOrSelector(
  ref: string | undefined,
  selector: string | undefined,
): { ref?: string; selector?: string } {
  const trimmedRef = typeof ref === "string" ? ref.trim() : "";
  const trimmedSelector = typeof selector === "string" ? selector.trim() : "";
  if (!trimmedRef && !trimmedSelector) {
    throw new Error("ref or selector is required");
  }
  return {
    ref: trimmedRef || undefined,
    selector: trimmedSelector || undefined,
  };
}

export function normalizeTimeoutMs(timeoutMs: number | undefined, fallback: number) {
  return Math.max(500, Math.min(120_000, timeoutMs ?? fallback));
}

export function isRetryablePlaywrightError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes("socket closed") ||
    msg.includes("socket hung up") ||
    msg.includes("target closed") ||
    msg.includes("target crashed") ||
    msg.includes("session closed") ||
    msg.includes("frame has been detached") ||
    msg.includes("not connected") ||
    msg.includes("extension disconnected") ||
    msg.includes("extension request timeout") ||
    msg.includes("cdp command timeout") ||
    msg.includes("page has been closed") ||
    msg.includes("context or browser has been closed") ||
    msg.includes("no attached tab") ||
    msg.includes("debugger_dead")
  );
}

export function toAIFriendlyError(error: unknown, selector: string): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("strict mode violation")) {
    const countMatch = message.match(/resolved to (\d+) elements/);
    const count = countMatch ? countMatch[1] : "multiple";
    return new Error(
      `Selector "${selector}" matched ${count} elements. ` +
        `Run a new snapshot to get updated refs, or use a different ref.`,
    );
  }

  if (
    (message.includes("Timeout") || message.includes("waiting for")) &&
    (message.includes("to be visible") || message.includes("not visible"))
  ) {
    return new Error(
      `Element "${selector}" not found or not visible. ` +
        `Run a new snapshot to see current page elements.`,
    );
  }

  if (
    message.includes("intercepts pointer events") ||
    message.includes("not visible") ||
    message.includes("not receive pointer events")
  ) {
    return new Error(
      `Element "${selector}" is not interactable (hidden or covered). ` +
        `Try scrolling it into view, closing overlays, or re-snapshotting.`,
    );
  }

  return error instanceof Error ? error : new Error(message);
}
