import type { BrowserRouteContext } from "../server-context.js";
import { registerBrowserAgentActRoutes } from "./agent.act.js";
import { registerBrowserAgentDebugRoutes } from "./agent.debug.js";
import { registerBrowserAgentReadRoutes } from "./agent.read.js";
import { registerBrowserAgentSnapshotRoutes } from "./agent.snapshot.js";
import { registerBrowserAgentStorageRoutes } from "./agent.storage.js";
import type { BrowserRouteRegistrar } from "./types.js";

export function registerBrowserAgentRoutes(app: BrowserRouteRegistrar, ctx: BrowserRouteContext) {
  registerBrowserAgentSnapshotRoutes(app, ctx);
  registerBrowserAgentReadRoutes(app, ctx);
  registerBrowserAgentActRoutes(app, ctx);
  registerBrowserAgentDebugRoutes(app, ctx);
  registerBrowserAgentStorageRoutes(app, ctx);
}
