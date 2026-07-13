/**
 * Regression tests for buildNodeOptionsWithGuard().
 *
 * NODE_OPTIONS is tokenized by Node with shell-like rules where backslash is
 * an ESCAPE character. A Windows guard path injected verbatim
 * (`--require "C:\Users\me\User Data\openclaw\cwd-guard.cjs"`) therefore had
 * its separators eaten, and the gateway child crashed on boot with
 *   Error: Cannot find module 'C:UsersmeUser Dataopenclawcwd-guard.cjs'
 * (MODULE_NOT_FOUND), so the OpenClaw gateway port never came up on Windows.
 * The fix normalises separators to forward slashes (accepted by `require` on
 * every platform) before injecting into NODE_OPTIONS.
 */

import { describe, it, expect } from "vitest";
import { buildNodeOptionsWithGuard } from "./cwd-guard";

describe("buildNodeOptionsWithGuard", () => {
  it("does not emit backslashes for a Windows path (regression)", () => {
    const winPath =
      "C:\\Users\\me\\AppData\\Local\\Sigma\\User Data\\Default\\openclaw\\cwd-guard.cjs";
    const result = buildNodeOptionsWithGuard(winPath, undefined);
    // The whole point: no backslash survives into NODE_OPTIONS, so Node's
    // tokenizer can't eat the separators.
    expect(result).not.toContain("\\");
    expect(result).toBe(
      '--require "C:/Users/me/AppData/Local/Sigma/User Data/Default/openclaw/cwd-guard.cjs"',
    );
  });

  it("quotes forward-slash paths that contain spaces (macOS Application Support)", () => {
    const macPath =
      "/Users/me/Library/Application Support/Sigma/openclaw/cwd-guard.cjs";
    const result = buildNodeOptionsWithGuard(macPath, undefined);
    expect(result).toBe(
      '--require "/Users/me/Library/Application Support/Sigma/openclaw/cwd-guard.cjs"',
    );
  });

  it("leaves a space-free POSIX path unquoted", () => {
    const p = "/tmp/openclaw/cwd-guard.cjs";
    expect(buildNodeOptionsWithGuard(p, undefined)).toBe(
      "--require /tmp/openclaw/cwd-guard.cjs",
    );
  });

  it("appends to existing NODE_OPTIONS without dropping it", () => {
    const p = "C:\\a b\\cwd-guard.cjs";
    const result = buildNodeOptionsWithGuard(p, "--max-old-space-size=4096");
    expect(result).toBe(
      '--max-old-space-size=4096 --require "C:/a b/cwd-guard.cjs"',
    );
  });

  it("does not duplicate the flag if already present", () => {
    const p = "C:\\a b\\cwd-guard.cjs";
    const existing = '--require "C:/a b/cwd-guard.cjs"';
    expect(buildNodeOptionsWithGuard(p, existing)).toBe(existing);
  });

  it("passes existing through untouched when guard path is empty", () => {
    expect(buildNodeOptionsWithGuard("", "--foo")).toBe("--foo");
  });
});
