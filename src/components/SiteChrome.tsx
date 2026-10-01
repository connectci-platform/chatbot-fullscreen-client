"use client";

import { useEffect, useState } from "react";
import dynamicImport from "next/dynamic";
import { Header, UniversalMenus, Footer } from "@access-ci/ui/react";

// The ACCESS JWT is minted only by support.access-ci.org (not by CILogon
// directly), so login must route through support rather than the package's
// default CILogon-skin URL. However this flow is NOT yet functional
// end-to-end: support's login only redirects back to a support-internal
// relative path (it drops any absolute/cross-origin destination param), and
// the minted SESSaccess_auth JWT cookie is scoped to .access-ci.org, so this
// app only receives it if hosted on an *.access-ci.org subdomain. A plain
// link to support login is a dead end for returning here — there is no
// return-redirect to wire until this app's deploy origin is settled.
//
// The real pattern once the origin is settled: open support login in a
// popup/new tab, let it mint the cookie, then this app detects the
// now-present cookie and resumes in place (not a redirect round-trip).
const LOGIN_URL = "https://support.access-ci.org/user/login";

const LOGOUT_URL = "https://cilogon.org/logout/?skin=access";

// TODO(auth): the app's real session cookie, SESSaccess_auth, is HttpOnly
// and not readable from JS. This checks the non-HttpOnly presence cookie
// SESSaccesscisso as a stand-in; treat this as a follow-up to replace with
// a proper server-verified auth check.
function detectLoggedIn(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith("SESSaccesscisso="));
}

function SiteChromeTopImpl() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(detectLoggedIn());
  }, []);

  return (
    <>
      <UniversalMenus
        siteName="Assistant"
        isLoggedIn={isLoggedIn}
        loginUrl={LOGIN_URL}
        logoutUrl={LOGOUT_URL}
      />
      <Header
        siteName="Assistant"
        siteUrl="/"
      />
    </>
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
