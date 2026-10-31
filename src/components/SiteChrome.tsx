"use client";

import { useCallback } from "react";
import dynamicImport from "next/dynamic";
import { Header, UniversalMenus, Footer } from "@access-ci/ui/react";
import { useAgentAuth } from "@/hooks/use-agent-auth";
import { loginUrl, logoutUrl, openSignIn } from "@/lib/sign-in";

// Login and logout both go through support. Support mints the agent tokens,
// so signing in there is what makes the next mint succeed, and its logout
// ends the Drupal session, the SSO cookies and the CILogon session together.
// Login opens in a popup so the user never leaves this tab; useAgentAuth
// mints again when the popup closes or this window regains focus.

export function SiteChromeTopImpl() {
  const authenticated = useAgentAuth() === "signed_in";
  const login = loginUrl();

  // UniversalMenus is a shadow-DOM web component and only takes a loginUrl
  // string (no onClick), so there's no prop-level way to open a popup
  // instead of navigating the tab. A capture-phase listener on the wrapper
  // still sees the click: shadow DOM click events are composed (they bubble
  // out of an open shadow root), so `composedPath()` includes the real
  // anchor even though `event.target` is retargeted to the shadow host.
  const handleCaptureClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = event.nativeEvent
        .composedPath()
        .find(
          (el): el is HTMLAnchorElement =>
            el instanceof HTMLAnchorElement && el.href === login,
        );
      if (!anchor) return;

      event.preventDefault();
      openSignIn();
    },
    [login],
  );

  return (
    <div onClickCapture={handleCaptureClick}>
      <UniversalMenus
        siteName="Assistant"
        isLoggedIn={authenticated}
        loginUrl={login}
        logoutUrl={logoutUrl()}
      />
      <Header
        siteName="Assistant"
        siteUrl="/"
      />
    </div>
  );
}

function SiteFooterImpl() {
  return <Footer />;
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
export const SiteFooter = dynamicImport(() => Promise.resolve(SiteFooterImpl), {
  ssr: false,
});
