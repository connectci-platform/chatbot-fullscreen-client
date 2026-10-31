"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  getAgentTokenSource,
  type AgentTokenSource,
  type AuthStatus,
} from "@/lib/agent-token";
import { showSignInError } from "@/lib/sign-in";

/** The source's signed-in state, without minting or listening for focus. */
export function useAuthStatus(
  source: AgentTokenSource = getAgentTokenSource(),
): AuthStatus {
  return useSyncExternalStore(
    source.subscribe,
    source.getStatus,
    () => "unknown" as const,
  );
}

/**
 * Signed-in state from the mint result. Mints on mount, and again on window
 * focus only while signed out, so returning from a sign-in tab is picked up
 * without spending the mint limit on every focus.
 */
export function useAgentAuth(
  source: AgentTokenSource = getAgentTokenSource(),
): AuthStatus {
  const status = useAuthStatus(source);

  useEffect(() => {
    // Strict so a failure is shown once here; agent requests that share this
    // mint still go out anonymously.
    source.getToken({ strict: true }).catch(showSignInError);
    const onFocus = () => {
      if (source.getStatus() === "signed_out") {
        source.refresh().catch(() => {});
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [source]);

  return status;
}
