"use client";

import { useCallback } from "react";
import dynamicImport from "next/dynamic";
import { Header, UniversalMenus } from "@access-ci/ui/react";
import { program } from "@/config/program";
import { useAgentAuth } from "@/hooks/use-agent-auth";
import { loginUrl, logoutUrl, openSignIn } from "@/lib/sign-in";
import { clearClaimKey } from "@/lib/thread-claim";

// Login and logout both go through support. Support mints the agent tokens,
// so signing in there is what makes the next mint succeed, and its logout
// ends the Drupal session, the SSO cookies and the CILogon session together.
// Login opens in a popup so the user never leaves this tab; useAgentAuth
// mints again when the popup closes or this window regains focus.

// The ACCESS menus render into a shadow root through a React portal, so
// React sees one click twice: from the portal's container and from the page.
// Each click is acted on once.
const handledClicks = new WeakSet<Event>();

export function SiteChromeTopImpl() {
  const authenticated = useAgentAuth() === "signed_in";
  const login = loginUrl();
  const logout = logoutUrl();

  // UniversalMenus is a shadow-DOM web component and only takes a loginUrl
  // string (no onClick), so there's no prop-level way to open a popup
  // instead of navigating the tab. A capture-phase listener on the wrapper
  // still sees the click: shadow DOM click events are composed (they bubble
  // out of an open shadow root), so `composedPath()` includes the real
  // anchor even though `event.target` is retargeted to the shadow host.
  const handleCaptureClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (handledClicks.has(event.nativeEvent)) return;
      const anchor = event.nativeEvent
        .composedPath()
        .find(
          (el): el is HTMLAnchorElement =>
            el instanceof HTMLAnchorElement &&
            (el.href === login || el.href === logout),
        );
      if (!anchor) return;
      handledClicks.add(event.nativeEvent);

      if (anchor.href === logout) {
        // Logout leaves this page, so this is the last chance to clear it.
        clearClaimKey();
        return;
      }
      event.preventDefault();
      openSignIn();
    },
    [login, logout],
  );

  return (
    <div onClickCapture={handleCaptureClick}>
      <UniversalMenus
        siteName={program.siteName}
        isLoggedIn={authenticated}
        loginUrl={login}
        logoutUrl={logout}
      />
      {program.features.siteHeader && (
        <Header
          siteName={program.siteName}
          siteUrl="/"
        />
      )}
    </div>
  );
}

// The chrome renders shadow-DOM components that read window/document and
// derives isLoggedIn client-side, so it's loaded ssr:false — no
// server-rendered placeholder to flash or hydration-mismatch against.
// next/dynamic with ssr:false must be called from a Client Component
// (this file), not from layout.tsx, which is a Server Component.
export const SiteChromeTop = dynamicImport(
  () => Promise.resolve(SiteChromeTopImpl),
  { ssr: false },
);
