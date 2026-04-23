import { parseBooleanValue } from "../../utils/boolean.js";
import { BrowserProfileNotFoundError } from "../errors.js";
import type { BrowserRouteContext, ProfileContext } from "../server-context.js";
import type { BrowserRequest, BrowserResponse } from "./types.js";

/**
 * Extract profile name from query string or body and get profile context.
 * Query string takes precedence over body for consistency with GET routes.
 *
 * When the profile name is *explicitly* supplied by the caller and does not
 * exist, we return 400 Bad Request rather than 404. This avoids confusing the
 * caller (especially LLM agents) into treating an invalid profile selection
 * as a transient resource-not-found condition. A 404 is reserved for the case
 * where no profile was supplied and the configured default is missing — that
 * is a server-side misconfiguration.
 */
export function getProfileContext(
  req: BrowserRequest,
  ctx: BrowserRouteContext,
): ProfileContext | { error: string; status: number } {
  let profileName: string | undefined;

  // Check query string first (works for GET and POST)
  if (typeof req.query.profile === "string") {
    profileName = req.query.profile.trim() || undefined;
  }

  // Fall back to body for POST requests
  if (!profileName && req.body && typeof req.body === "object") {
    const body = req.body as Record<string, unknown>;
    if (typeof body.profile === "string") {
      profileName = body.profile.trim() || undefined;
    }
  }

  const explicit = profileName !== undefined;
  try {
    return ctx.forProfile(profileName);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof BrowserProfileNotFoundError) {
      return { error: message, status: explicit ? 400 : 404 };
    }
    return { error: message, status: 500 };
  }
}

export function jsonError(res: BrowserResponse, status: number, message: string) {
  res.status(status).json({ error: message });
}

export function toStringOrEmpty(value: unknown) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

export function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function toBoolean(value: unknown) {
  return parseBooleanValue(value, {
    truthy: ["true", "1", "yes"],
    falsy: ["false", "0", "no"],
  });
}

export function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.map((v) => toStringOrEmpty(v)).filter(Boolean);
  return strings.length ? strings : undefined;
}
