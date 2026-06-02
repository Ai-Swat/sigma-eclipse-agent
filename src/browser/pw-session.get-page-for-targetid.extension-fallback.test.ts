import { chromium } from "playwright-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as chromeModule from "./chrome.js";
import { closePlaywrightBrowserConnection, getPageForTargetId } from "./pw-session.js";

const connectOverCdpSpy = vi.spyOn(chromium, "connectOverCDP");
const getChromeWebSocketUrlSpy = vi.spyOn(chromeModule, "getChromeWebSocketUrl");

afterEach(async () => {
  connectOverCdpSpy.mockClear();
  getChromeWebSocketUrlSpy.mockClear();
  await closePlaywrightBrowserConnection().catch(() => {});
});

function createExtensionFallbackBrowserHarness(options?: {
  urls?: string[];
  newCDPSessionError?: string;
}) {
  const pageOn = vi.fn();
  const contextOn = vi.fn();
  const browserOn = vi.fn();
  const browserClose = vi.fn(async () => {});
  const newCDPSession = vi.fn(async () => {
    throw new Error(options?.newCDPSessionError ?? "Not allowed");
  });

  const context = {
    pages: () => [],
    on: contextOn,
    newCDPSession,
  } as unknown as import("playwright-core").BrowserContext;

  const pages = (options?.urls ?? [undefined]).map(
    (url) =>
      ({
        on: pageOn,
        context: () => context,
        ...(url ? { url: () => url } : {}),
      }) as unknown as import("playwright-core").Page,
  );
  (context as unknown as { pages: () => unknown[] }).pages = () => pages;

  const browser = {
    contexts: () => [context],
    on: browserOn,
    close: browserClose,
  } as unknown as import("playwright-core").Browser;

  connectOverCdpSpy.mockResolvedValue(browser);
  getChromeWebSocketUrlSpy.mockResolvedValue(null);
  return { browserClose, newCDPSession, pages };
}

describe("pw-session getPageForTargetId", () => {
  it("falls back to the only page when CDP session attachment is blocked (extension relays)", async () => {
    const { browserClose, pages } = createExtensionFallbackBrowserHarness();
    const [page] = pages;

    const resolved = await getPageForTargetId({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "NOT_A_TAB",
    });
    expect(resolved).toBe(page);

    await closePlaywrightBrowserConnection();
    expect(browserClose).toHaveBeenCalled();
  });

  it("uses the shared HTTP-base normalization when falling back to /json/list for direct WebSocket CDP URLs", async () => {
    const [, pageB] = createExtensionFallbackBrowserHarness({
      urls: ["https://alpha.example", "https://beta.example"],
    }).pages;

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { id: "TARGET_A", url: "https://alpha.example" },
        { id: "TARGET_B", url: "https://beta.example" },
      ],
    } as Response);

    try {
      const resolved = await getPageForTargetId({
        cdpUrl: "ws://127.0.0.1:18792/devtools/browser/SESSION?token=abc",
        targetId: "TARGET_B",
      });
      expect(resolved).toBe(pageB);
      expect(fetchSpy).toHaveBeenCalledWith(
        "http://127.0.0.1:18792/json/list?token=abc",
        expect.any(Object),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("retries page resolution while the relay's /json/list transiently lacks the target", async () => {
    vi.useFakeTimers();
    const { pages } = createExtensionFallbackBrowserHarness({
      urls: ["https://alpha.example", "https://beta.example"],
      newCDPSessionError: "Target.attachToBrowserTarget: Not allowed",
    });
    const [, pageB] = pages;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      // relay-endpoint probe (isExtensionRelayCdpEndpoint), cached afterwards
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Browser: "OpenClaw/extension-relay" }),
      } as Response)
      // first /json/list pass: target re-creating during navigation, not listed yet
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: "TARGET_A", url: "https://alpha.example" }],
      } as Response)
      // subsequent passes: target has re-appeared
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "TARGET_A", url: "https://alpha.example" },
          { id: "TARGET_B", url: "https://beta.example" },
        ],
      } as Response);

    try {
      const promise = getPageForTargetId({
        cdpUrl: "http://127.0.0.1:20111",
        targetId: "TARGET_B",
      });
      await vi.advanceTimersByTimeAsync(600);
      const resolved = await promise;
      expect(resolved).toBe(pageB);
    } finally {
      fetchSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("positionally aligns relay pages with /json/list when Playwright cannot expose page URLs", async () => {
    // Reproduces the field scenario: over the extension relay Playwright reports
    // page.url() === "" for every page, so URL-based matching is impossible even
    // though the target exists in /json/list. We must still resolve by position.
    const pageOn = vi.fn();
    const contextOn = vi.fn();
    const browserOn = vi.fn();
    const newCDPSession = vi.fn(async () => {
      throw new Error("Target.attachToBrowserTarget: Not allowed");
    });
    const context = {
      pages: () => [],
      on: contextOn,
      newCDPSession,
    } as unknown as import("playwright-core").BrowserContext;
    const pages = ["", ""].map(
      (url) =>
        ({
          on: pageOn,
          context: () => context,
          url: () => url,
        }) as unknown as import("playwright-core").Page,
    );
    (context as unknown as { pages: () => unknown[] }).pages = () => pages;
    const browser = {
      contexts: () => [context],
      on: browserOn,
      close: vi.fn(async () => {}),
    } as unknown as import("playwright-core").Browser;
    connectOverCdpSpy.mockResolvedValue(browser);
    getChromeWebSocketUrlSpy.mockResolvedValue(null);

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Browser: "OpenClaw/extension-relay" }),
      } as Response)
      .mockResolvedValue({
        ok: true,
        json: async () => [
          { id: "1588776567", url: "sigma://home-page/" },
          { id: "1588776569", url: "about:blank" },
        ],
      } as Response);

    try {
      const resolved = await getPageForTargetId({
        cdpUrl: "http://127.0.0.1:20222",
        targetId: "1588776569",
      });
      expect(resolved).toBe(pages[1]);
      expect(newCDPSession).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("resolves extension-relay pages from /json/list without probing page CDP sessions first", async () => {
    const { newCDPSession, pages } = createExtensionFallbackBrowserHarness({
      urls: ["https://alpha.example", "https://beta.example"],
      newCDPSessionError: "Target.attachToBrowserTarget: Not allowed",
    });
    const [, pageB] = pages;

    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Browser: "OpenClaw/extension-relay" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: "TARGET_A", url: "https://alpha.example" },
          { id: "TARGET_B", url: "https://beta.example" },
        ],
      } as Response);

    try {
      const resolved = await getPageForTargetId({
        cdpUrl: "http://127.0.0.1:19993",
        targetId: "TARGET_B",
      });
      expect(resolved).toBe(pageB);
      expect(newCDPSession).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
