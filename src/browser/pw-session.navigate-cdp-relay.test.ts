import { beforeEach, describe, expect, it, vi } from "vitest";

const evalBehavior = vi.hoisted(() => ({ shouldThrow: false }));

const pageCdpMocks = vi.hoisted(() => ({
  isExtensionRelayCdpEndpoint: vi.fn(async () => true),
  withPageScopedCdpClient: vi.fn(
    async (opts: {
      fn: (send: (m: string, p?: unknown) => Promise<unknown>) => Promise<unknown>;
    }) => {
      if (evalBehavior.shouldThrow) {
        throw new Error("Runtime.evaluate not forwarded");
      }
      return opts.fn(async (method: string) => {
        if (method === "Runtime.evaluate") {
          return { result: { type: "undefined" } };
        }
        return {};
      });
    },
  ),
}));

const jsonList = vi.hoisted(() => ({ queue: [] as string[], fallback: "about:blank" }));

const cdpHelperMocks = vi.hoisted(() => ({
  appendCdpPath: (base: string, path: string) => `${base}${path}`,
  normalizeCdpHttpBaseForJsonEndpoints: (url: string) => url,
  fetchJson: vi.fn(async () => {
    const url = jsonList.queue.length > 0 ? jsonList.queue.shift()! : jsonList.fallback;
    return [
      { id: "home", url: "sigma://home-page/" },
      { id: "tab-1", url },
    ];
  }),
  getHeadersWithAuth: () => ({}),
  withCdpSocket: vi.fn(),
}));

vi.mock("./pw-session.page-cdp.js", () => pageCdpMocks);
vi.mock("./cdp.helpers.js", () => cdpHelperMocks);

const { navigateTargetViaCdpOverRelay } = await import("./pw-session.js");

const fakePage = { url: () => "" } as never;

describe("navigateTargetViaCdpOverRelay", () => {
  beforeEach(() => {
    evalBehavior.shouldThrow = false;
    jsonList.queue = [];
    jsonList.fallback = "about:blank";
    pageCdpMocks.withPageScopedCdpClient.mockClear();
    cdpHelperMocks.fetchJson.mockClear();
  });

  it("issues location.assign via Runtime.evaluate and confirms commit via /json/list", async () => {
    jsonList.queue = ["about:blank", "https://ru.wikipedia.org/wiki/Денвер"];

    const result = await navigateTargetViaCdpOverRelay({
      cdpUrl: "http://127.0.0.1:18792",
      targetId: "tab-1",
      url: "https://ru.wikipedia.org/wiki/Денвер",
      timeoutMs: 5000,
      page: fakePage,
    });

    expect(result.url).toBe("https://ru.wikipedia.org/wiki/Денвер");
    expect(pageCdpMocks.withPageScopedCdpClient).toHaveBeenCalledTimes(1);
  });

  it("throws when the target never leaves about:blank within the timeout", async () => {
    jsonList.fallback = "about:blank";

    await expect(
      navigateTargetViaCdpOverRelay({
        cdpUrl: "http://127.0.0.1:18792",
        targetId: "tab-1",
        url: "https://ru.wikipedia.org/wiki/Денвер",
        timeoutMs: 400,
        page: fakePage,
      }),
    ).rejects.toThrow(/did not commit/i);
  });

  it("throws a descriptive error when the navigation command cannot be issued", async () => {
    evalBehavior.shouldThrow = true;

    await expect(
      navigateTargetViaCdpOverRelay({
        cdpUrl: "http://127.0.0.1:18792",
        targetId: "tab-1",
        url: "https://ru.wikipedia.org/wiki/Денвер",
        timeoutMs: 1000,
        page: fakePage,
      }),
    ).rejects.toThrow(/could not be issued/i);
  });
});
