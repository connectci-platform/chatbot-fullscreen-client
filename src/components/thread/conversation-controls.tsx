import { forwardRef } from "react";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useConversationsOpen } from "@/hooks/use-conversations-open";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/** The conversations sidebar, which the toggles control. */
export const CONVERSATIONS_SIDEBAR_ID = "conversations-sidebar";
/** The top bar's toggle, where focus goes back when the sidebar closes. */
export const CONVERSATIONS_TOGGLE_ID = "conversations-toggle";
/** The open sidebar's Hide button, where focus goes when it opens. */
export const CONVERSATIONS_HIDE_ID = "conversations-hide";

/**
 * Starts a new conversation. Labeled, in the ACCESS dark teal, at least
 * 44px tall for touch.
 */
export const NewChatButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant="brand"
      className={cn(
        "bg-brand-dark border-brand-dark hover:bg-brand-dark/90 focus-visible:ring-ring h-11 rounded-none px-4 text-sm font-semibold text-white focus-visible:ring-[3px] focus-visible:ring-offset-2",
        className,
      )}
      {...props}
    >
      <MessageSquarePlus
        aria-hidden
        className="size-5"
      />
      New chat
    </Button>
  ),
);
NewChatButton.displayName = "NewChatButton";

/**
 * Opens the conversations sidebar from the top bar. On a wide screen the
 * open sidebar has its own Hide button, so this one steps aside; on a phone
 * the list opens over the page and this stays where it was.
 */
export function ConversationsToggle() {
  const [open, setOpen] = useConversationsOpen();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  if (open && isLargeScreen) return null;

  return (
    <Button
      id={CONVERSATIONS_TOGGLE_ID}
      type="button"
      variant="ghost"
      className="size-11 hover:bg-gray-100"
      aria-label={open ? "Hide conversations" : "Show conversations"}
      aria-expanded={open}
      // On a phone the list opens as a dialog instead of the sidebar.
      aria-controls={isLargeScreen ? CONVERSATIONS_SIDEBAR_ID : undefined}
      aria-haspopup={isLargeScreen ? undefined : "dialog"}
      onClick={() => setOpen((o) => !o)}
    >
      {open ? (
        <PanelLeftClose
          aria-hidden
          className="size-5"
        />
      ) : (
        <PanelLeftOpen
          aria-hidden
          className="size-5"
        />
      )}
    </Button>
  );
}

/**
 * Closes the open sidebar. Says "Hide" on screen; its full name, "Hide
 * conversations", starts with that word so voice control finds it.
 */
export function HideConversationsButton({
  onClick,
  id,
}: {
  onClick: () => void;
  id?: string;
}) {
  return (
    <Button
      id={id}
      type="button"
      variant="ghost"
      className="h-11 px-3 hover:bg-gray-100"
      aria-label="Hide conversations"
      aria-expanded
      aria-controls={CONVERSATIONS_SIDEBAR_ID}
      onClick={onClick}
    >
      <PanelLeftClose
        aria-hidden
        className="size-5"
      />
      Hide
    </Button>
  );
}
