import type { SsrFPolicy } from "../infra/net/ssrf.js";
import { type AriaSnapshotNode, formatAriaSnapshot, type RawAXNode } from "./cdp.js";
import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationRedirectChainAllowed,
  assertBrowserNavigationResultAllowed,
  withBrowserNavigationPolicy,
} from "./navigation-guard.js";
import {
  buildRoleSnapshotFromAiSnapshot,
  buildRoleSnapshotFromAriaSnapshot,
  getRoleSnapshotStats,
  type RoleSnapshotOptions,
  type RoleRefMap,
} from "./pw-role-snapshot.js";
import {
  ensurePageState,
  forceDisconnectPlaywrightForTarget,
  getPageForTargetId,
  navigateTargetViaCdpOverRelay,
  storeRoleRefsForTarget,
  type WithSnapshotForAI,
} from "./pw-session.js";
import { isExtensionRelayCdpEndpoint, withPageScopedCdpClient } from "./pw-session.page-cdp.js";
import { isRetryablePlaywrightError } from "./pw-tools-core.shared.js";

const SNAPSHOT_RETRY_DELAY_MS = 1500;

export async function snapshotAriaViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  limit?: number;
}): Promise<{ nodes: AriaSnapshotNode[] }> {
  const limit = Math.max(1, Math.min(2000, Math.floor(opts.limit ?? 500)));

  const attempt = async () => {
    const page = await getPageForTargetId({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
    });
    ensurePageState(page);
    const formatted = await withPageScopedCdpClient({
      cdpUrl: opts.cdpUrl,
      page,
      targetId: opts.targetId,
      commandTimeoutMs: 55_000,
      fn: async (send) => {
        await send("Accessibility.enable").catch(() => {});
        const axTree = (await send("Accessibility.getFullAXTree")) as {
          nodes?: RawAXNode[];
        };
        const rawNodes = Array.isArray(axTree?.nodes) ? axTree.nodes : [];
        const nodes = formatAriaSnapshot(rawNodes, limit);

        // Inject data-oc-ref attributes so ax\d+ refs work with Playwright locators.
        const withBackendId = nodes.filter(
          (n): n is AriaSnapshotNode & { backendDOMNodeId: number } =>
            typeof n.backendDOMNodeId === "number" && n.backendDOMNodeId > 0,
        );
        if (withBackendId.length > 0) {
          try {
            await send("DOM.getDocument", { depth: 0 });
            const { nodeIds } = (await send("DOM.pushNodesByBackendIdsToFrontend", {
              backendNodeIds: withBackendId.map((n) => n.backendDOMNodeId),
            })) as { nodeIds: number[] };
            const setOps = nodeIds
              .map((nodeId, i) =>
                nodeId > 0
                  ? send("DOM.setAttributeValue", {
                      nodeId,
                      name: "data-oc-ref",
                      value: withBackendId[i].ref,
                    }).catch(() => {})
                  : undefined,
              )
              .filter(Boolean);
            await Promise.all(setOps);
          } catch {
            // Best-effort: if DOM injection fails, aria refs won't be interactive
          }
        }

        return nodes;
      },
    });
    return { nodes: formatted };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isRetryablePlaywrightError(err)) {
      throw err;
    }
    await forceDisconnectPlaywrightForTarget({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      reason: "retry aria snapshot after failure",
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, SNAPSHOT_RETRY_DELAY_MS));
    return await attempt();
  }
}

export async function snapshotAiViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  timeoutMs?: number;
  maxChars?: number;
}): Promise<{ snapshot: string; truncated?: boolean; refs: RoleRefMap }> {
  const attempt = async () => {
    const page = await getPageForTargetId({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
    });
    ensurePageState(page);

    const maybe = page as unknown as WithSnapshotForAI;
    if (!maybe._snapshotForAI) {
      throw new Error("Playwright _snapshotForAI is not available. Upgrade playwright-core.");
    }

    const result = await maybe._snapshotForAI({
      timeout: Math.max(500, Math.min(60_000, Math.floor(opts.timeoutMs ?? 5000))),
      track: "response",
    });
    let snapshot = String(result?.full ?? "");
    const fullLength = snapshot.length;

    // Diagnostics: the agent reports getting "about:blank"/empty content even
    // when navigate succeeded. That happens when the snapshot resolves to the
    // wrong (blank) page — e.g. positional-fallback picked a sibling tab, or a
    // cross-process navigation swapped the target id and the session still
    // references the old blank one. Log the resolved page url + snapshot size
    // whenever the result looks blank so we can confirm it from gateway logs.
    let resolvedUrl = "";
    try {
      resolvedUrl = page.url() || "";
    } catch {
      resolvedUrl = "?";
    }
    if (fullLength < 2000 || !resolvedUrl || resolvedUrl === "about:blank") {
      console.warn(
        `[pw-session] ai-snapshot suspicious target=${
          opts.targetId ?? "(default)"
        } resolvedUrl=${resolvedUrl.slice(0, 80) || "(empty)"} chars=${fullLength}`,
      );
    }

    const maxChars = opts.maxChars;
    const limit =
      typeof maxChars === "number" && Number.isFinite(maxChars) && maxChars > 0
        ? Math.floor(maxChars)
        : undefined;
    let truncated = false;
    if (limit && snapshot.length > limit) {
      snapshot = `${snapshot.slice(0, limit)}\n\n[...TRUNCATED - page too large]`;
      truncated = true;
    }

    // Diagnostics: when a large page's AI snapshot is truncated, the model often
    // only sees the navigation/TOC/headings at the top of the accessibility tree
    // and never reaches the prose. Log the raw size vs limit so we can tell a
    // genuine truncation from an efficient-mode/empty-page or model-narration
    // case from the gateway logs.
    if (truncated) {
      console.warn(
        `[pw-session] ai-snapshot truncated target=${
          opts.targetId ?? "(default)"
        } fullChars=${fullLength} limit=${limit} keptPct=${Math.round(
          ((limit ?? 0) / fullLength) * 100,
        )}`,
      );
    }

    const built = buildRoleSnapshotFromAiSnapshot(snapshot);
    storeRoleRefsForTarget({
      page,
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      refs: built.refs,
      mode: "aria",
    });
    return truncated ? { snapshot, truncated, refs: built.refs } : { snapshot, refs: built.refs };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isRetryablePlaywrightError(err)) {
      throw err;
    }
    await forceDisconnectPlaywrightForTarget({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      reason: "retry ai snapshot after failure",
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, SNAPSHOT_RETRY_DELAY_MS));
    return await attempt();
  }
}

export async function snapshotRoleViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  selector?: string;
  frameSelector?: string;
  refsMode?: "role" | "aria";
  options?: RoleSnapshotOptions;
}): Promise<{
  snapshot: string;
  refs: Record<string, { role: string; name?: string; nth?: number }>;
  stats: { lines: number; chars: number; refs: number; interactive: number };
}> {
  const attempt = async () => {
    const page = await getPageForTargetId({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
    });
    ensurePageState(page);

    if (opts.refsMode === "aria") {
      if (opts.selector?.trim() || opts.frameSelector?.trim()) {
        throw new Error("refs=aria does not support selector/frame snapshots yet.");
      }
      const maybe = page as unknown as WithSnapshotForAI;
      if (!maybe._snapshotForAI) {
        throw new Error("refs=aria requires Playwright _snapshotForAI support.");
      }
      const result = await maybe._snapshotForAI({
        timeout: 5000,
        track: "response",
      });
      const built = buildRoleSnapshotFromAiSnapshot(String(result?.full ?? ""), opts.options);
      storeRoleRefsForTarget({
        page,
        cdpUrl: opts.cdpUrl,
        targetId: opts.targetId,
        refs: built.refs,
        mode: "aria",
      });
      return {
        snapshot: built.snapshot,
        refs: built.refs,
        stats: getRoleSnapshotStats(built.snapshot, built.refs),
      };
    }

    const frameSelector = opts.frameSelector?.trim() || "";
    const selector = opts.selector?.trim() || "";
    const locator = frameSelector
      ? selector
        ? page.frameLocator(frameSelector).locator(selector)
        : page.frameLocator(frameSelector).locator(":root")
      : selector
        ? page.locator(selector)
        : page.locator(":root");

    const ariaSnapshot = await locator.ariaSnapshot();
    const built = buildRoleSnapshotFromAriaSnapshot(String(ariaSnapshot ?? ""), opts.options);
    storeRoleRefsForTarget({
      page,
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      refs: built.refs,
      frameSelector: frameSelector || undefined,
      mode: "role",
    });
    return {
      snapshot: built.snapshot,
      refs: built.refs,
      stats: getRoleSnapshotStats(built.snapshot, built.refs),
    };
  };

  try {
    return await attempt();
  } catch (err) {
    if (!isRetryablePlaywrightError(err)) {
      throw err;
    }
    await forceDisconnectPlaywrightForTarget({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      reason: "retry role snapshot after failure",
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, SNAPSHOT_RETRY_DELAY_MS));
    return await attempt();
  }
}

export async function navigateViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  url: string;
  timeoutMs?: number;
  ssrfPolicy?: SsrFPolicy;
}): Promise<{ url: string }> {
  const isRetryableNavigateError = (err: unknown): boolean => {
    const msg =
      typeof err === "string"
        ? err.toLowerCase()
        : err instanceof Error
          ? err.message.toLowerCase()
          : "";
    return (
      msg.includes("frame has been detached") ||
      msg.includes("target page, context or browser has been closed")
    );
  };

  const url = String(opts.url ?? "").trim();
  if (!url) {
    throw new Error("url is required");
  }
  await assertBrowserNavigationAllowed({
    url,
    ...withBrowserNavigationPolicy(opts.ssrfPolicy),
  });
  const timeout = Math.max(1000, Math.min(120_000, opts.timeoutMs ?? 20_000));

  // Over the extension relay, drive navigation through raw CDP Page.navigate
  // (addressed by targetId) instead of Playwright's page.goto. goto detaches
  // deterministically on the cross-process commit and never lands; the CDP path
  // does not depend on a live Playwright frame surviving the renderer swap.
  if (opts.targetId && (await isExtensionRelayCdpEndpoint(opts.cdpUrl))) {
    const result = await navigateTargetViaCdpOverRelay({
      cdpUrl: opts.cdpUrl,
      targetId: opts.targetId,
      url,
      timeoutMs: timeout,
    });
    await assertBrowserNavigationResultAllowed({
      url: result.url,
      ...withBrowserNavigationPolicy(opts.ssrfPolicy),
    });
    return result;
  }

  // Cross-process navigation over the extension relay detaches the frame while
  // the renderer swaps. A single immediate retry isn't enough: field logs show
  // both the initial goto AND a ~170ms-later retry hit "Frame has been detached"
  // back-to-back, while the next tool call ~4s later succeeded. So retry a few
  // times with a short backoff (and a forced reconnect each time) to ride out
  // the swap window. Tunable via env for field debugging.
  const maxNavigateAttempts = Math.max(
    1,
    Number(process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_ATTEMPTS) || 4,
  );
  const navigateRetryDelayMs = Math.max(
    0,
    Number(process.env.OPENCLAW_BROWSER_NAVIGATE_RETRY_DELAY_MS) || 400,
  );
  let page = await getPageForTargetId(opts);
  ensurePageState(page);
  const navigate = async () => await page.goto(url, { timeout });
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await navigate();
      break;
    } catch (err) {
      if (!isRetryableNavigateError(err) || attempt >= maxNavigateAttempts) {
        throw err;
      }
      console.warn(
        `[pw-session] navigate detached-frame retry ${attempt}/${
          maxNavigateAttempts - 1
        } target=${opts.targetId ?? "(default)"} url=${url.slice(0, 80)}`,
      );
      // Extension relays can briefly drop CDP during renderer swaps/navigation.
      // Force a clean reconnect, wait out the swap window, then retry on the
      // refreshed page handle.
      await forceDisconnectPlaywrightForTarget({
        cdpUrl: opts.cdpUrl,
        targetId: opts.targetId,
        reason: "retry navigate after detached frame",
      }).catch(() => {});
      if (navigateRetryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, navigateRetryDelayMs));
      }
      page = await getPageForTargetId(opts);
      ensurePageState(page);
    }
  }
  await assertBrowserNavigationRedirectChainAllowed({
    request: response?.request(),
    ...withBrowserNavigationPolicy(opts.ssrfPolicy),
  });
  const finalUrl = page.url();
  await assertBrowserNavigationResultAllowed({
    url: finalUrl,
    ...withBrowserNavigationPolicy(opts.ssrfPolicy),
  });
  return { url: finalUrl };
}

export async function resizeViewportViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
  width: number;
  height: number;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.setViewportSize({
    width: Math.max(1, Math.floor(opts.width)),
    height: Math.max(1, Math.floor(opts.height)),
  });
}

export async function closePageViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
}): Promise<void> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  await page.close();
}

export async function pdfViaPlaywright(opts: {
  cdpUrl: string;
  targetId?: string;
}): Promise<{ buffer: Buffer }> {
  const page = await getPageForTargetId(opts);
  ensurePageState(page);
  const buffer = await page.pdf({ printBackground: true });
  return { buffer };
}
