import { evaluateChromeMcpScript, navigateChromeMcpPage } from "../chrome-mcp.js";
import {
  buildReadPageFunction,
  buildReadTableFunction,
  buildSearchResultsFunction,
  searchUrl,
  type BrowserReadPageRequest,
  type BrowserReadTableRequest,
  type BrowserSearchRequest,
} from "../content-extraction.js";
import {
  assertBrowserNavigationAllowed,
  assertBrowserNavigationResultAllowed,
  withBrowserNavigationPolicy,
} from "../navigation-guard.js";
import { getBrowserProfileCapabilities } from "../profile-capabilities.js";
import type { BrowserRouteContext } from "../server-context.js";
import { readBody, requirePwAi, withRouteTabContext } from "./agent.shared.js";
import type { BrowserRequest, BrowserResponse, BrowserRouteRegistrar } from "./types.js";
import { jsonError, toNumber, toStringOrEmpty } from "./utils.js";

function readTargetId(body: Record<string, unknown>): string | undefined {
  return toStringOrEmpty(body.targetId) || undefined;
}

function readSelector(body: Record<string, unknown>): string | undefined {
  return toStringOrEmpty(body.selector) || undefined;
}

async function evaluateResearchFunction(params: {
  req: BrowserRequest;
  res: BrowserResponse;
  profileName: string;
  usesChromeMcp: boolean;
  cdpUrl: string;
  targetId: string;
  fn: string;
}) {
  if (params.usesChromeMcp) {
    return await evaluateChromeMcpScript({
      profileName: params.profileName,
      targetId: params.targetId,
      fn: params.fn,
    });
  }
  const pw = await requirePwAi(params.res, "read page content");
  if (!pw) {
    return undefined;
  }
  return await pw.evaluateViaPlaywright({
    cdpUrl: params.cdpUrl,
    targetId: params.targetId,
    fn: params.fn,
    signal: params.req.signal,
  });
}

export function registerBrowserAgentReadRoutes(
  app: BrowserRouteRegistrar,
  ctx: BrowserRouteContext,
) {
  app.post("/read", async (req, res) => {
    const body = readBody(req);
    const request: BrowserReadPageRequest = {
      targetId: readTargetId(body),
      selector: readSelector(body),
      maxChars: toNumber(body.maxChars),
      offset: toNumber(body.offset),
    };
    await withRouteTabContext({
      req,
      res,
      ctx,
      targetId: request.targetId,
      run: async ({ profileCtx, tab, cdpUrl }) => {
        const result = await evaluateResearchFunction({
          req,
          res,
          profileName: profileCtx.profile.name,
          usesChromeMcp: getBrowserProfileCapabilities(profileCtx.profile).usesChromeMcp,
          cdpUrl,
          targetId: tab.targetId,
          fn: buildReadPageFunction(request),
        });
        if (result !== undefined) {
          res.json({ targetId: tab.targetId, result });
        }
      },
    });
  });

  app.post("/table", async (req, res) => {
    const body = readBody(req);
    const request: BrowserReadTableRequest = {
      targetId: readTargetId(body),
      selector: readSelector(body),
      index: toNumber(body.index),
      maxRows: toNumber(body.maxRows),
      offset: toNumber(body.offset),
    };
    await withRouteTabContext({
      req,
      res,
      ctx,
      targetId: request.targetId,
      run: async ({ profileCtx, tab, cdpUrl }) => {
        const result = await evaluateResearchFunction({
          req,
          res,
          profileName: profileCtx.profile.name,
          usesChromeMcp: getBrowserProfileCapabilities(profileCtx.profile).usesChromeMcp,
          cdpUrl,
          targetId: tab.targetId,
          fn: buildReadTableFunction(request),
        });
        if (result !== undefined) {
          res.json({ targetId: tab.targetId, result });
        }
      },
    });
  });

  app.post("/search", async (req, res) => {
    const body = readBody(req);
    const query = toStringOrEmpty(body.query);
    const engineRaw = toStringOrEmpty(body.engine) || "google";
    if (!query) {
      return jsonError(res, 400, "query is required");
    }
    if (!["google", "bing", "duckduckgo"].includes(engineRaw)) {
      return jsonError(res, 400, "engine must be google, bing, or duckduckgo");
    }
    const request: BrowserSearchRequest = {
      targetId: readTargetId(body),
      query,
      engine: engineRaw as BrowserSearchRequest["engine"],
      maxResults: toNumber(body.maxResults),
    };
    const url = searchUrl(request);
    await withRouteTabContext({
      req,
      res,
      ctx,
      targetId: request.targetId,
      run: async ({ profileCtx, tab, cdpUrl }) => {
        const capabilities = getBrowserProfileCapabilities(profileCtx.profile);
        const policy = withBrowserNavigationPolicy(ctx.state().resolved.ssrfPolicy);
        await assertBrowserNavigationAllowed({ url, ...policy });
        if (capabilities.usesChromeMcp) {
          const navigated = await navigateChromeMcpPage({
            profileName: profileCtx.profile.name,
            targetId: tab.targetId,
            url,
          });
          await assertBrowserNavigationResultAllowed({ url: navigated.url, ...policy });
        } else {
          const pw = await requirePwAi(res, "search");
          if (!pw) {
            return;
          }
          const navigated = await pw.navigateViaPlaywright({
            cdpUrl,
            targetId: tab.targetId,
            url,
            ...policy,
          });
          await assertBrowserNavigationResultAllowed({ url: navigated.url, ...policy });
        }
        const result = await evaluateResearchFunction({
          req,
          res,
          profileName: profileCtx.profile.name,
          usesChromeMcp: capabilities.usesChromeMcp,
          cdpUrl,
          targetId: tab.targetId,
          fn: buildSearchResultsFunction(request.maxResults),
        });
        if (result !== undefined) {
          res.json({ targetId: tab.targetId, query, engine: request.engine, result });
        }
      },
    });
  });
}
