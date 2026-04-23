import { afterEach, describe, expect, it, vi } from "vitest";
import { withFetchPreconnect } from "../test-utils/fetch-mock.js";
import * as cdpModule from "./cdp.js";
import { BrowserProfileUnavailableError } from "./errors.js";
import { createBrowserRouteContext } from "./server-context.js";
import { makeState, originalFetch } from "./server-context.remote-tab-ops.harness.js";

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("openTab fallback error wrapping", () => {
  it("wraps a bare HTTP 404 from PUT /json/new into a friendly BrowserProfileUnavailableError", async () => {
    // Simulate the Sigma extension being disconnected: the WebSocket
    // Target.createTarget path fails because /json/version has no
    // webSocketDebuggerUrl, and the extension-relay then returns 404 for the
    // HTTP /json/new fallback (it does not implement that endpoint).
    vi.spyOn(cdpModule, "createTargetViaCdp").mockRejectedValue(
      new Error("CDP /json/version missing webSocketDebuggerUrl"),
    );

    const fetchMock = vi.fn(async (url: unknown, init?: { method?: string }) => {
      const u = String(url);
      if (u.includes("/json/new")) {
        // Match how cdp.helpers.fetchCdpChecked surfaces a 404 with empty body.
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          text: async () => "",
        } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${u} (method=${init?.method ?? "GET"})`);
    });
    global.fetch = withFetchPreconnect(fetchMock);

    const state = makeState("openclaw");
    state.resolved.profiles.openclaw = {
      cdpUrl: "http://127.0.0.1:18792",
      color: "#FF4500",
    };
    const ctx = createBrowserRouteContext({ getState: () => state });
    const openclaw = ctx.forProfile("openclaw");

    let caught: unknown;
    try {
      await openclaw.openTab("https://example.com");
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BrowserProfileUnavailableError);
    const friendly = caught as BrowserProfileUnavailableError;
    expect(friendly.status).toBe(409);
    // Friendly message must mention the profile, the CDP URL, and a recovery hint.
    expect(friendly.message).toContain('"openclaw"');
    expect(friendly.message).toContain("127.0.0.1:18792");
    expect(friendly.message).toMatch(/extension|browser/i);
    // The original CDP context must be preserved for debuggability.
    expect(friendly.message).toContain("webSocketDebuggerUrl");
    // The bare "HTTP 404" must not be the *headline* (it can still appear in
    // the diagnostic suffix); but the agent-visible explanation must not start
    // with it.
    expect(friendly.message.startsWith("HTTP 404")).toBe(false);
  });
});
