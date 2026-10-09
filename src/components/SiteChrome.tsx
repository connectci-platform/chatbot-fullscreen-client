"use client";

import { useCallback } from "react";
import dynamicImport from "next/dynamic";
import { Header, UniversalMenus, Footer } from "@access-ci/ui/react";
import { useWhoami } from "@/hooks/use-whoami";
import { resolveApiUrl } from "@/lib/resolve-api-url";

// The ACCESS JWT is minted only by support.access-ci.org (not by CILogon
// directly), so login routes through support rather than the package's
// default CILogon-skin URL. Login opens in a popup (see the click
// interception below) so the user never leaves this tab; the minted
// SESSaccess_auth JWT cookie is scoped to .access-ci.org and is sent on the
// agent's whoami request via `credentials: "include"`. useWhoami re-checks
// on window focus, so completing login in the popup and returning focus to
// this tab is what flips isLoggedIn — there is no redirect back into this
// app to wire.
const LOGIN_URL = "https://support.access-ci.org/user/login";

const LOGOUT_URL = "https://cilogon.org/logout/?skin=access";

export function SiteChromeTopImpl() {
  const apiUrl = resolveApiUrl("", process.env.NEXT_PUBLIC_API_URL);
  const { authenticated } = useWhoami(apiUrl || undefined);

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
            el instanceof HTMLAnchorElement && el.href === LOGIN_URL,
        );
      if (!anchor) return;

      event.preventDefault();
      const popup = window.open(
        LOGIN_URL,
        "_blank",
        "popup,width=480,height=720",
      );
      if (!popup) {
        window.open(LOGIN_URL, "_blank");
      }
    },
    [],
  );

  return (
    <div onClickCapture={handleCaptureClick}>
      <UniversalMenus
        siteName="Assistant"
        isLoggedIn={authenticated}
        loginUrl={LOGIN_URL}
        logoutUrl={LOGOUT_URL}
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
