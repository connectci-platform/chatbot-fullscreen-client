import { forwardRef, useLayoutEffect, useRef, type ReactNode } from "react";
import { MessageSquarePlus, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useConversationsOpen } from "@/hooks/use-conversations-open";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  CONVERSATIONS_TOGGLE_ATTR,
  NEW_CHAT_ATTR,
  TOP_BAR_ATTR,
  focusShown,
} from "./control-focus";

/** The conversations sidebar, which the toggles control. */
export const CONVERSATIONS_SIDEBAR_ID = "conversations-sidebar";
/** The open sidebar's Hide button, where focus goes when it opens. */
export const CONVERSATIONS_HIDE_ID = "conversations-hide";

/**
 * Starts a new conversation. Labeled, in the ACCESS dark teal, at least
 * 44px tall for touch.
 */
export const NewChatButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, ...props }, ref) => (
    <Button
      {...{ [NEW_CHAT_ATTR]: "" }}
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
        className="size-6"
      />
      New chat
    </Button>
  ),
);
NewChatButton.displayName = "NewChatButton";

/**
 * Opens the conversations sidebar. On a wide screen the open sidebar has
 * its own Hide button, so this one steps aside; on a phone the list opens
 * over the page and this stays where it was.
 */
export function ConversationsToggle({
  labelled = false,
  compact = false,
}: {
  /** Says "Conversations" beside the icon, where the bar has room. */
  labelled?: boolean;
  /** The small icon under the message box, with a tooltip for its name. */
  compact?: boolean;
}) {
  const [open, setOpen] = useConversationsOpen();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  if (open && isLargeScreen) return null;

  const name = open ? "Hide conversations" : "Show conversations";
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  const button = (
    <Button
      {...{ [CONVERSATIONS_TOGGLE_ATTR]: "" }}
      type="button"
      variant="ghost"
      className={cn(
        "hover:bg-gray-100",
        compact ? COMPACT_CLASSES : labelled ? "h-11 px-3" : "size-11",
      )}
      aria-label={name}
      aria-expanded={open}
      // On a phone the list opens as a dialog instead of the sidebar.
      aria-controls={isLargeScreen ? CONVERSATIONS_SIDEBAR_ID : undefined}
      aria-haspopup={isLargeScreen ? undefined : "dialog"}
      onClick={() => setOpen((o) => !o)}
    >
      <Icon
        aria-hidden
        className={compact ? "size-4" : "size-6"}
      />
      {labelled && !compact && "Conversations"}
    </Button>
  );
  return compact ? <WithTooltip label={name}>{button}</WithTooltip> : button;
}

/**
 * The compact buttons' size: a 24px target in the disclaimer's 16px line,
 * the extra 4px above and below taken from the space around it so the line
 * stays as tall as its text.
 */
const COMPACT_CLASSES =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring -my-1 size-6 shrink-0 rounded-none p-0 focus-visible:ring-2";

function WithTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * The top bar's Conversations toggle and New chat as two small icons, for
 * the left of the disclaimer line while the top bar is out of view. They do
 * what the top bar's do. If they go away while one has focus (the top bar
 * came back into view), focus moves to the top bar's copy.
 */
export function ConversationShortcuts({
  onNewChat,
}: {
  /** Leave out where the top bar has no New chat (the empty screen). */
  onNewChat?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open] = useConversationsOpen();
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  useLayoutEffect(() => {
    const group = ref.current;
    return () => {
      const active = document.activeElement;
      if (!group || !active || !group.contains(active)) return;
      const top = `[${TOP_BAR_ATTR}]`;
      if (active.hasAttribute(CONVERSATIONS_TOGGLE_ATTR)) {
        focusShown(`${top} [${CONVERSATIONS_TOGGLE_ATTR}]`, group);
      } else if (active.hasAttribute(NEW_CHAT_ATTR)) {
        focusShown(`${top} [${NEW_CHAT_ATTR}]`, group);
      }
    };
  }, []);

  // The open sidebar has both buttons instead, as for the top bar's.
  if (open && isLargeScreen && !onNewChat) return null;

  return (
    <div
      ref={ref}
      data-testid="conversation-shortcuts"
      className="flex shrink-0 items-center gap-1"
    >
      <ConversationsToggle compact />
      {onNewChat && (
        <WithTooltip label="New chat">
          <Button
            {...{ [NEW_CHAT_ATTR]: "" }}
            type="button"
            variant="ghost"
            className={cn("hover:bg-gray-100", COMPACT_CLASSES)}
            aria-label="New chat"
            onClick={onNewChat}
          >
            <MessageSquarePlus
              aria-hidden
              className="size-4"
            />
          </Button>
        </WithTooltip>
      )}
    </div>
  );
}

/**
 * Closes the open sidebar. Says "Hide" on screen; its full name, "Hide
 * conversations", starts with that word so voice control finds it.
 */
export function HideConversationsButton({
  onClick,
  id,
  controlsSidebar,
}: {
  onClick: () => void;
  id?: string;
  /** True in the sidebar itself; false in the phone's dialog. */
  controlsSidebar: boolean;
}) {
  return (
    <Button
      id={id}
      type="button"
      variant="ghost"
      className="h-11 px-3 hover:bg-gray-100"
      aria-label="Hide conversations"
      aria-expanded
      // In the phone's dialog there's no sidebar on screen to point at.
      aria-controls={controlsSidebar ? CONVERSATIONS_SIDEBAR_ID : undefined}
      onClick={onClick}
    >
      <PanelLeftClose
        aria-hidden
        className="size-6"
      />
      Hide
    </Button>
  );
}
