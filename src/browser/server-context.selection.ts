import { fetchOk, normalizeCdpHttpBaseForJsonEndpoints } from "./cdp.helpers.js";
import { appendCdpPath } from "./cdp.js";
import { closeChromeMcpTab, focusChromeMcpTab } from "./chrome-mcp.js";
import type { ResolvedBrowserProfile } from "./config.js";
import { BrowserTabNotFoundError, BrowserTargetAmbiguousError } from "./errors.js";
import { getBrowserProfileCapabilities } from "./profile-capabilities.js";
import type { PwAiModule } from "./pw-ai-module.js";
import { getPwAiModule } from "./pw-ai-module.js";
import type { BrowserTab, ProfileRuntimeState } from "./server-context.types.js";
import { resolveTargetIdFromTabs } from "./target-id.js";

type SelectionDeps = {
  profile: ResolvedBrowserProfile;
  getProfileState: () => ProfileRuntimeState;
  ensureBrowserAvailable: () => Promise<void>;
  listTabs: () => Promise<BrowserTab[]>;
  openTab: (url: string) => Promise<BrowserTab>;
};

type SelectionOps = {
  ensureTabAvailable: (targetId?: string) => Promise<BrowserTab>;
  focusTab: (targetId: string) => Promise<void>;
  closeTab: (targetId: string) => Promise<void>;
};

const EXTENSION_REATTACH_WAIT_MS = 10_000;
const EXTENSION_REATTACH_POLL_MS = 200;

function isLikelyEphemeralTargetId(targetId: string): boolean {
  return /^\d+$/.test(targetId) || /^[a-f0-9]{16,}$/i.test(targetId);
}

function isHttpPage(tab: BrowserTab): boolean {
  return (tab.type ?? "page") === "page" && /^https?:\/\//i.test(tab.url ?? "");
}

function findLastTab(
  tabs: BrowserTab[],
  predicate: (tab: BrowserTab) => boolean,
): BrowserTab | null {
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    const tab = tabs[i];
    if (tab && predicate(tab)) {
      return tab;
    }
  }
  return null;
}

export function createProfileSelectionOps({
  profile,
  getProfileState,
  ensureBrowserAvailable,
  listTabs,
  openTab,
}: SelectionDeps): SelectionOps {
  const cdpHttpBase = normalizeCdpHttpBaseForJsonEndpoints(profile.cdpUrl);
  const capabilities = getBrowserProfileCapabilities(profile);

  const ensureTabAvailable = async (targetId?: string): Promise<BrowserTab> => {
    await ensureBrowserAvailable();
    const profileState = getProfileState();
    let tabs1 = await listTabs();
    if (tabs1.length === 0) {
      if (capabilities.requiresAttachedTab) {
        // Chrome extension relay can briefly drop its WebSocket connection (MV3 service worker
        // lifecycle, relay restart). If we previously had a target selected, wait briefly for
        // the extension to reconnect and re-announce its attached tabs before failing.
        if (profileState.lastTargetId?.trim()) {
          const deadlineAt = Date.now() + EXTENSION_REATTACH_WAIT_MS;
          while (tabs1.length === 0 && Date.now() < deadlineAt) {
            await new Promise((resolve) => setTimeout(resolve, EXTENSION_REATTACH_POLL_MS));
            tabs1 = await listTabs();
          }
        }
        if (tabs1.length === 0) {
          throw new BrowserTabNotFoundError(
            `tab not found (no attached tabs for profile "${profile.name}"). ` +
              "The Sigma Eclipse Extension auto-attaches the active tab — navigate to a page and retry.",
          );
        }
      } else {
        await openTab("about:blank");
      }
    }

    let tabs = await listTabs();
    let candidates = capabilities.supportsPerTabWs ? tabs.filter((t) => Boolean(t.wsUrl)) : tabs;

    const resolveById = (raw: string) => {
      const resolved = resolveTargetIdFromTabs(raw, candidates);
      if (!resolved.ok) {
        if (resolved.reason === "ambiguous") {
          return "AMBIGUOUS" as const;
        }
        return null;
      }
      return candidates.find((t) => t.targetId === resolved.targetId) ?? null;
    };

    const pickDefault = () => {
      const last = profileState.lastTargetId?.trim() || "";
      const lastResolved = last ? resolveById(last) : null;
      if (lastResolved && lastResolved !== "AMBIGUOUS") {
        return lastResolved;
      }
      if (last && capabilities.requiresAttachedTab) {
        const httpPage = findLastTab(candidates, isHttpPage);
        if (httpPage) {
          return httpPage;
        }
      }
      // Prefer a real page tab first (avoid service workers/background targets).
      const page = candidates.find((t) => (t.type ?? "page") === "page");
      return page ?? candidates.at(0) ?? null;
    };

    const pickStaleTargetFallback = () => {
      if (!capabilities.requiresAttachedTab) {
        return null;
      }
      // Extension tab ids can change during navigation/reattach. When the caller
      // reuses a stale ephemeral id, prefer the latest real web page over
      // internal pages or older about:blank tabs.
      return findLastTab(candidates, isHttpPage) ?? pickDefault();
    };

    let chosen = targetId ? resolveById(targetId) : pickDefault();
    if (!chosen && targetId && isLikelyEphemeralTargetId(targetId)) {
      chosen = pickStaleTargetFallback();
    }

    if (!chosen && capabilities.requiresAttachedTab) {
      const wantedTargetId = targetId?.trim() || profileState.lastTargetId?.trim() || "";
      const shouldWaitForTarget =
        Boolean(wantedTargetId) && (!targetId || isLikelyEphemeralTargetId(wantedTargetId));
      if (shouldWaitForTarget) {
        const deadlineAt = Date.now() + EXTENSION_REATTACH_WAIT_MS;
        while (!chosen && Date.now() < deadlineAt) {
          await new Promise((resolve) => setTimeout(resolve, EXTENSION_REATTACH_POLL_MS));
          tabs = await listTabs();
          candidates = capabilities.supportsPerTabWs ? tabs.filter((t) => Boolean(t.wsUrl)) : tabs;
          chosen = targetId ? resolveById(targetId) : pickDefault();
        }
      }
      if (!chosen && targetId && isLikelyEphemeralTargetId(targetId)) {
        chosen = pickStaleTargetFallback();
      }
    }

    if (chosen === "AMBIGUOUS") {
      throw new BrowserTargetAmbiguousError();
    }
    if (!chosen) {
      throw new BrowserTabNotFoundError();
    }
    profileState.lastTargetId = chosen.targetId;
    return chosen;
  };

  const resolveTargetIdOrThrow = async (targetId: string): Promise<string> => {
    const tabs = await listTabs();
    const resolved = resolveTargetIdFromTabs(targetId, tabs);
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        throw new BrowserTargetAmbiguousError();
      }
      throw new BrowserTabNotFoundError();
    }
    return resolved.targetId;
  };

  const focusTab = async (targetId: string): Promise<void> => {
    const resolvedTargetId = await resolveTargetIdOrThrow(targetId);

    if (capabilities.usesChromeMcp) {
      await focusChromeMcpTab(profile.name, resolvedTargetId);
      const profileState = getProfileState();
      profileState.lastTargetId = resolvedTargetId;
      return;
    }

    if (capabilities.usesPersistentPlaywright) {
      const mod = await getPwAiModule({ mode: "strict" });
      const focusPageByTargetIdViaPlaywright = (mod as Partial<PwAiModule> | null)
        ?.focusPageByTargetIdViaPlaywright;
      if (typeof focusPageByTargetIdViaPlaywright === "function") {
        await focusPageByTargetIdViaPlaywright({
          cdpUrl: profile.cdpUrl,
          targetId: resolvedTargetId,
        });
        const profileState = getProfileState();
        profileState.lastTargetId = resolvedTargetId;
        return;
      }
    }

    await fetchOk(appendCdpPath(cdpHttpBase, `/json/activate/${resolvedTargetId}`));
    const profileState = getProfileState();
    profileState.lastTargetId = resolvedTargetId;
  };

  const closeTab = async (targetId: string): Promise<void> => {
    const resolvedTargetId = await resolveTargetIdOrThrow(targetId);

    if (capabilities.usesChromeMcp) {
      await closeChromeMcpTab(profile.name, resolvedTargetId);
      return;
    }

    // For remote profiles, use Playwright's persistent connection to close tabs
    if (capabilities.usesPersistentPlaywright) {
      const mod = await getPwAiModule({ mode: "strict" });
      const closePageByTargetIdViaPlaywright = (mod as Partial<PwAiModule> | null)
        ?.closePageByTargetIdViaPlaywright;
      if (typeof closePageByTargetIdViaPlaywright === "function") {
        await closePageByTargetIdViaPlaywright({
          cdpUrl: profile.cdpUrl,
          targetId: resolvedTargetId,
        });
        return;
      }
    }

    await fetchOk(appendCdpPath(cdpHttpBase, `/json/close/${resolvedTargetId}`));
  };

  return {
    ensureTabAvailable,
    focusTab,
    closeTab,
  };
}
