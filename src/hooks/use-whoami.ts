"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface WhoamiState {
  authenticated: boolean;
  user: string | null;
}

const ANON: WhoamiState = { authenticated: false, user: null };

/**
 * Server-verified auth state from the agent's GET /api/v1/whoami.
 *
 * Replaces reading the unsigned SESSaccesscisso presence cookie: that cookie
 * can linger after the real SESSaccess_auth session expires, so it can report
 * "logged in" when the user is not. whoami validates the HttpOnly JWT
 * server-side. Fails open to anonymous on any error — never blocks the UI.
 *
 * Re-checks on window focus so a login completed in a popup is reflected when
 * the user returns to this tab (the popup is cross-origin on support.access-ci.org,
 * so it cannot message us; focus-on-return is the detection signal).
 */
export function useWhoami(apiUrl: string | undefined): WhoamiState & {
  refresh: () => void;
} {
  const [state, setState] = useState<WhoamiState>(ANON);
  const genRef = useRef(0);

  const refresh = useCallback(() => {
    if (!apiUrl) {
      setState(ANON);
      return;
    }
    const myGen = ++genRef.current;
    fetch(`${apiUrl}/whoami`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: WhoamiState | null) => {
        if (myGen !== genRef.current) return; // a newer refresh superseded this one
        setState(
          body && body.authenticated
            ? { authenticated: true, user: body.user ?? null }
            : ANON,
        );
      })
      .catch(() => {
        if (myGen !== genRef.current) return; // same guard on the error path
        setState(ANON);
      });
  }, [apiUrl]);

  useEffect(() => {
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  return { ...state, refresh };
}
