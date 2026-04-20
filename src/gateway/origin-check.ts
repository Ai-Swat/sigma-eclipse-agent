import { isLoopbackHost, normalizeHostHeader } from "./net.js";

type OriginCheckResult =
  | {
      ok: true;
      matchedBy: "allowlist" | "host-header-fallback" | "local-loopback";
    }
  | { ok: false; reason: string };

type ParsedOrigin = {
  /** WHATWG-serialized origin (lowercased). For non-special schemes this is `"null"`. */
  origin: string;
  /** Original lowercased `<scheme>://<host>` form preserved verbatim from the header. */
  serialized: string;
  host: string;
  hostname: string;
  protocol: string;
};

function parseOrigin(originRaw?: string): ParsedOrigin | null {
  const trimmed = (originRaw ?? "").trim();
  if (!trimmed || trimmed === "null") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return {
      origin: url.origin.toLowerCase(),
      serialized: trimmed.toLowerCase(),
      host: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol.toLowerCase(),
    };
  } catch {
    return null;
  }
}

export function checkBrowserOrigin(params: {
  requestHost?: string;
  origin?: string;
  allowedOrigins?: string[];
  allowHostHeaderOriginFallback?: boolean;
  isLocalClient?: boolean;
}): OriginCheckResult {
  const parsedOrigin = parseOrigin(params.origin);
  if (!parsedOrigin) {
    return { ok: false, reason: "origin missing or invalid" };
  }

  const allowlist = new Set(
    (params.allowedOrigins ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean),
  );
  if (allowlist.has("*") || allowlist.has(parsedOrigin.origin)) {
    return { ok: true, matchedBy: "allowlist" };
  }

  // For non-special schemes (chrome-extension://, moz-extension://, file://, ...),
  // WHATWG URL serializes `.origin` as the literal string "null", which means a
  // configured allowlist entry like `chrome-extension://<id>` would never match
  // unless the operator additionally added the magic string `"null"`. Match the
  // entry against the original `<scheme>://<host>` form so the natural
  // configuration works as expected. (HTTP/HTTPS still go through the strict
  // serialized-origin path above.)
  if (parsedOrigin.origin === "null" && parsedOrigin.host) {
    const literal = `${parsedOrigin.protocol}//${parsedOrigin.host}`;
    if (allowlist.has(literal)) {
      return { ok: true, matchedBy: "allowlist" };
    }
  }

  const requestHost = normalizeHostHeader(params.requestHost);
  if (
    params.allowHostHeaderOriginFallback === true &&
    requestHost &&
    parsedOrigin.host === requestHost
  ) {
    return { ok: true, matchedBy: "host-header-fallback" };
  }

  // Dev fallback only for genuinely local socket clients, not Host-header claims.
  if (params.isLocalClient && isLoopbackHost(parsedOrigin.hostname)) {
    return { ok: true, matchedBy: "local-loopback" };
  }

  return { ok: false, reason: "origin not allowed" };
}
