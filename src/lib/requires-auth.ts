import { toast } from "sonner";
import { openSignIn } from "./sign-in";

/**
 * The agent's call-time gate refused a tool: `write_action` and
 * `private_data` need a signed-in user, and `write_scope` means this surface
 * can't make changes even when signed in.
 */
export type RequiresAuthEvent = {
  type: "requires_auth";
  reason: "write_action" | "private_data" | "write_scope";
};

export function isRequiresAuthEvent(
  event: unknown,
): event is RequiresAuthEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { type?: unknown }).type === "requires_auth"
  );
}

export function showRequiresAuth(event: RequiresAuthEvent) {
  if (event.reason === "write_scope") {
    toast.info("Changes aren't available here.", { closeButton: true });
    return;
  }
  toast.info("Sign in to continue", {
    description: "This needs your ACCESS account.",
    action: { label: "Sign in", onClick: () => openSignIn() },
    duration: 15000,
    closeButton: true,
  });
}
