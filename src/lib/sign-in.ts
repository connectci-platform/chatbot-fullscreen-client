import { toast } from "sonner";
import {
  getAgentTokenSource,
  getSupportUrl,
  type AgentTokenSource,
} from "./agent-token";

export function loginUrl(): string {
  return `${getSupportUrl()}/user/login`;
}

export function logoutUrl(): string {
  return `${getSupportUrl()}/user/logout`;
}

const POPUP_POLL_MS = 500;

/**
 * Opens support's login in a popup and mints again once it closes. When the
 * user is already signed in elsewhere, seamless SSO and CILogon usually bounce
 * the popup straight back without a form. Falls back to a new tab when popups
 * are blocked; the focus re-mint in useAgentAuth covers that case.
 */
export function openSignIn(source: AgentTokenSource = getAgentTokenSource()) {
  const url = loginUrl();
  const popup = window.open(url, "_blank", "popup,width=480,height=720");
  if (!popup) {
    window.open(url, "_blank");
    return;
  }
  const timer = window.setInterval(() => {
    if (!popup.closed) return;
    window.clearInterval(timer);
    // Closing the popup also refocuses this window, and that may already
    // have minted.
    if (source.getStatus() !== "signed_in") {
      source.refresh().catch(showSignInError);
    }
  }, POPUP_POLL_MS);
}

/** Tells the user a sign-in check failed; the chat continues signed out. */
export function showSignInError(error: unknown) {
  toast.error(
    error instanceof Error ? error.message : "Couldn't check your sign-in.",
    { richColors: true, closeButton: true },
  );
}
