import React from "react";
import { useNavigate } from "react-router-dom";
import { getDesktopApiOrNull } from "@ipc/desktopApi";
import { routes } from "../routes";

const NAVIGABLE_ROUTES: Record<string, string> = {
  sigma: routes.sigma,
  chat: routes.chat,
  settings: routes.settings,
  terminal: routes.terminal,
};

/**
 * Listens for `sigmaeclipse://navigate/<route>` deep links
 * and navigates the renderer to the corresponding route.
 */
export function useDeepLinkNavigation(): void {
  const navigate = useNavigate();

  React.useEffect(() => {
    const api = getDesktopApiOrNull();
    if (!api?.onDeepLink) return;

    const unsub = api.onDeepLink((payload) => {
      if (payload.host !== "navigate") return;

      // pathname comes as "/sigma", "/chat", etc. — strip leading slash
      const routeKey = payload.pathname.replace(/^\//, "");
      const target = NAVIGABLE_ROUTES[routeKey];
      if (target) {
        void navigate(target, { replace: true });
      }
    });

    return unsub;
  }, [navigate]);
}
