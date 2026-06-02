import { describe, expect, it, vi } from "vitest";
import { SsrFBlockedError } from "../infra/net/ssrf.js";
import { InvalidBrowserNavigationUrlError } from "./navigation-guard.js";
import {
  getPwToolsCoreSessionMocks,
  installPwToolsCoreTestHooks,
  setPwToolsCoreCurrentPage,
} from "./pw-tools-core.test-harness.js";

installPwToolsCoreTestHooks();
const mod = await import("./pw-tools-core.snapshot.js");

describe("pw-tools-core.snapshot navigate guard", () => {
  it("blocks unsupported non-network URLs before page lookup", async () => {
    const goto = vi.fn(async () => {});
    setPwToolsCoreCurrentPage({
      goto,
      url: vi.fn(() => "about:blank"),
    });

    await expect(
      mod.navigateViaPlaywright({
        cdpUrl: "http://127.0.0.1:18792",
        url: "file:///etc/passwd",
      }),
    ).rejects.toBeInstanceOf(InvalidBrowserNavigationUrlError);

    expect(getPwToolsCoreSessionMocks().getPageForTargetId).not.toHaveBeenCalled();
    expect(goto).not.toHaveBeenCalled();
  });

  it("navigates valid network URLs with clamped timeout", async () => {
    const goto = vi.fn(async () => {});
    setPwToolsCoreCurrentPage({
      goto,
      url: vi.fn(() => "https://example.com"),
    });

    const result = await mod.navigateViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      url: "https://example.com",
      timeoutMs: 10,
      ssrfPolicy: { allowPrivateNetwork: true },
    });

    expect(goto).toHaveBeenCalledWith("https://example.com", { timeout: 1000 });
    expect(result.url).toBe("https://example.com");
  });

  it("reconnects and retries once when navigation detaches frame", async () => {
    const goto = vi
      .fn<(...args: unknown[]) => Promise<void>>()
      .mockRejectedValueOnce(new Error("page.goto: Frame has been detached"))
      .mockResolvedValueOnce(undefined);
    setPwToolsCoreCurrentPage({
      goto,
      url: vi.fn(() => "https://example.com/recovered"),
    });

    const result = await mod.navigateViaPlaywright({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "tab-1",
      url: "https://example.com/recovered",
      ssrfPolicy: { allowPrivateNetwork: true },
    });

    expect(getPwToolsCoreSessionMocks().getPageForTargetId).toHaveBeenCalledTimes(2);
    expect(getPwToolsCoreSessionMocks().forceDisconnectPlaywrightForTarget).toHaveBeenCalledTimes(
      1,
    );
    expect(getPwToolsCoreSessionMocks().forceDisconnectPlaywrightForTarget).toHaveBeenCalledWith({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "tab-1",
      reason: "retry navigate after detached frame",
    });
    expect(goto).toHaveBeenCalledTimes(2);
    expect(result.url).toBe("https://example.com/recovered");
  });

  it("retries multiple times across a sustained detached-frame window", async () => {
    const prevDelay = process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS;
    process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS = "0";
    try {
      const goto = vi
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockRejectedValueOnce(new Error("page.goto: Frame has been detached"))
        .mockRejectedValueOnce(new Error("page.goto: Frame has been detached"))
        .mockRejectedValueOnce(new Error("page.goto: Frame has been detached"))
        .mockResolvedValueOnce(undefined);
      setPwToolsCoreCurrentPage({
        goto,
        url: vi.fn(() => "https://example.com/eventually"),
      });

      const result = await mod.navigateViaPlaywright({
        cdpUrl: "http://127.0.0.1:18792",
        targetId: "tab-9",
        url: "https://example.com/eventually",
        ssrfPolicy: { allowPrivateNetwork: true },
      });

      // default budget is 4 attempts: 3 failures + 1 success
      expect(goto).toHaveBeenCalledTimes(4);
      expect(getPwToolsCoreSessionMocks().forceDisconnectPlaywrightForTarget).toHaveBeenCalledTimes(
        3,
      );
      expect(result.url).toBe("https://example.com/eventually");
    } finally {
      if (prevDelay === undefined) {
        delete process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS;
      } else {
        process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS = prevDelay;
      }
    }
  });

  it("gives up after exhausting the retry budget on a persistent detached frame", async () => {
    const prevDelay = process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS;
    const prevAttempts = process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_ATTEMPTS;
    process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS = "0";
    process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_ATTEMPTS = "3";
    try {
      const goto = vi
        .fn<(...args: unknown[]) => Promise<void>>()
        .mockRejectedValue(new Error("page.goto: Frame has been detached"));
      setPwToolsCoreCurrentPage({
        goto,
        url: vi.fn(() => "about:blank"),
      });

      await expect(
        mod.navigateViaPlaywright({
          cdpUrl: "http://127.0.0.1:18792",
          targetId: "tab-stuck",
          url: "https://example.com/stuck",
          ssrfPolicy: { allowPrivateNetwork: true },
        }),
      ).rejects.toThrow(/detached/i);

      expect(goto).toHaveBeenCalledTimes(3);
    } finally {
      if (prevDelay === undefined) {
        delete process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS;
      } else {
        process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS = prevDelay;
      }
      if (prevAttempts === undefined) {
        delete process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_ATTEMPTS;
      } else {
        process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_ATTEMPTS = prevAttempts;
      }
    }
  });

  it("blocks private intermediate redirect hops during navigation", async () => {
    const goto = vi.fn(async () => ({
      request: () => ({
        url: () => "https://93.184.216.34/final",
        redirectedFrom: () => ({
          url: () => "http://127.0.0.1:18080/internal-hop",
          redirectedFrom: () => ({
            url: () => "https://93.184.216.34/start",
            redirectedFrom: () => null,
          }),
        }),
      }),
    }));
    setPwToolsCoreCurrentPage({
      goto,
      url: vi.fn(() => "https://93.184.216.34/final"),
    });

    await expect(
      mod.navigateViaPlaywright({
        cdpUrl: "http://127.0.0.1:18792",
        url: "https://93.184.216.34/start",
      }),
    ).rejects.toBeInstanceOf(SsrFBlockedError);

    expect(goto).toHaveBeenCalledTimes(1);
  });
});
