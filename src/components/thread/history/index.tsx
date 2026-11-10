import { Button } from "@/components/ui/button";
import { useThreads } from "@/providers/Thread";
import { Thread } from "@langchain/langgraph-sdk";
import { useEffect, useRef, useState } from "react";

import { getContentString } from "../utils";
import { useQueryState } from "nuqs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import {
  CONVERSATIONS_HIDE_ID,
  CONVERSATIONS_SIDEBAR_ID,
  CONVERSATIONS_TOGGLE_ATTR,
  HideConversationsButton,
  NewChatButton,
} from "../conversation-controls";
import { useConversationsOpen } from "@/hooks/use-conversations-open";
import { focusComposer } from "../composer";
import { SiteLinks } from "../site-links";

function ThreadList({
  threads,
  onThreadClick,
}: {
  threads: Thread[];
  onThreadClick?: (threadId: string) => void;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");

  return (
    <div className="min-h-0 w-full flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      <ul className="flex w-full flex-col gap-1 px-2 pb-2">
        {threads.map((t) => {
          let itemText = t.thread_id;
          if (
            typeof t.values === "object" &&
            t.values &&
            "messages" in t.values &&
            Array.isArray(t.values.messages) &&
            t.values.messages?.length > 0
          ) {
            const firstMessage = t.values.messages[0];
            itemText = getContentString(firstMessage.content);
          }
          const current = t.thread_id === threadId;
          return (
            <li key={t.thread_id}>
              <Button
                variant="ghost"
                aria-current={current ? "page" : undefined}
                className="aria-[current=page]:bg-accent min-h-11 w-full items-center justify-start text-left font-normal"
                onClick={(e) => {
                  e.preventDefault();
                  onThreadClick?.(t.thread_id);
                  if (current) return;
                  setThreadId(t.thread_id);
                }}
              >
                <span className="truncate">{itemText}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ThreadListEmpty({ loadFailed }: { loadFailed: boolean }) {
  const authStatus = useAuthStatus();
  // While the sign-in state is unknown, show neither message.
  const message = loadFailed
    ? "Couldn't load your conversations."
    : authStatus === "signed_in"
      ? "No conversations yet."
      : authStatus === "signed_out"
        ? "Sign in to see and resume your conversations."
        : null;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      {message && <p className="text-muted-foreground text-sm">{message}</p>}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-start justify-start gap-2 overflow-y-scroll [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent">
      {Array.from({ length: 30 }).map((_, i) => (
        <Skeleton
          key={`skeleton-${i}`}
          className="h-11 w-[280px]"
        />
      ))}
    </div>
  );
}

const SIDEBAR_HEADING_ID = "conversations-sidebar-heading";

/**
 * The top bar's toggle that's showing (wide or narrow screens' bar). Below
 * 1280px the bar is the first row of the conversation's scroller, so focus
 * must not scroll it into view: that would jump the chat back to the top.
 */
function focusConversationsToggle() {
  const toggles = document.querySelectorAll<HTMLElement>(
    `[${CONVERSATIONS_TOGGLE_ATTR}]`,
  );
  Array.from(toggles)
    .find((el) => el.getClientRects().length > 0 || toggles.length === 1)
    ?.focus({ preventScroll: true });
}

/** The sidebar's or the phone list's top: Hide, New chat, then the heading. */
function SidebarHeader({
  hideId,
  headingId,
  onHide,
  onNewChat,
  Heading,
}: {
  hideId?: string;
  /** For the sidebar, which is named by its heading. */
  headingId?: string;
  onHide: () => void;
  onNewChat: () => void;
  Heading: "h2" | typeof SheetTitle;
}) {
  return (
    <div className="flex w-full flex-col gap-3 px-2 pt-2">
      <div className="flex items-center justify-between gap-2">
        <HideConversationsButton
          id={hideId}
          onClick={onHide}
          controlsSidebar={Heading === "h2"}
        />
        <NewChatButton onClick={onNewChat} />
      </div>
      <Heading
        // Only when given: the dialog's title keeps the id it's named by.
        {...(headingId && { id: headingId })}
        className="px-2 text-xl font-semibold tracking-tight"
      >
        Conversations
      </Heading>
    </div>
  );
}

export default function ThreadHistory({
  onNewChat,
}: {
  /** Starts a new conversation; the list closes itself where it should. */
  onNewChat: () => void;
}) {
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  const [chatHistoryOpen, setChatHistoryOpen] = useConversationsOpen();
  const sidebarRef = useRef<HTMLElement>(null);

  // On a wide screen the toggle that opened the sidebar goes away and the
  // sidebar's controls stop being reachable when it closes, so focus moves
  // with them. Only on a change: a page loaded with the sidebar open leaves
  // focus alone. On a phone the dialog moves focus itself.
  const wasOpen = useRef(chatHistoryOpen);
  useEffect(() => {
    if (wasOpen.current === chatHistoryOpen) return;
    wasOpen.current = chatHistoryOpen;
    if (!isLargeScreen) return;
    if (chatHistoryOpen) {
      document
        .getElementById(CONVERSATIONS_HIDE_ID)
        ?.focus({ preventScroll: true });
      return;
    }
    const active = document.activeElement;
    if (
      !active ||
      active === document.body ||
      sidebarRef.current?.contains(active)
    ) {
      focusConversationsToggle();
    }
  }, [chatHistoryOpen, isLargeScreen]);

  // New chat or a conversation picked in the phone list closes it, and focus
  // goes to the message box of the chat on screen rather than back to the
  // toggle, which is scrolled away above a conversation.
  const focusComposerOnClose = useRef(false);

  const { getThreads, threads, setThreads, threadsLoading, setThreadsLoading } =
    useThreads();

  const [loadFailed, setLoadFailed] = useState(false);

  const loadThreads = () => {
    setThreadsLoading(true);
    getThreads()
      .then((loaded) => {
        setLoadFailed(false);
        setThreads(loaded);
      })
      .catch((error) => {
        console.error(error);
        setLoadFailed(true);
      })
      .finally(() => setThreadsLoading(false));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadThreads();
  }, []);

  // Signing in from the page (the popup) makes the user's own threads
  // visible, so load them again.
  const authStatus = useAuthStatus();
  const prevAuthStatus = useRef(authStatus);
  useEffect(() => {
    if (prevAuthStatus.current === "signed_out" && authStatus === "signed_in") {
      loadThreads();
    }
    prevAuthStatus.current = authStatus;
  }, [authStatus]);

  const list = (onThreadClick?: () => void) =>
    threadsLoading ? (
      <ThreadHistoryLoading />
    ) : threads.length === 0 ? (
      <ThreadListEmpty loadFailed={loadFailed} />
    ) : (
      <ThreadList
        threads={threads}
        onThreadClick={onThreadClick}
      />
    );

  return (
    <>
      {/* Off screen when closed, and inert so Tab can't reach it there. */}
      <aside
        ref={sidebarRef}
        id={CONVERSATIONS_SIDEBAR_ID}
        aria-labelledby={SIDEBAR_HEADING_ID}
        inert={!chatHistoryOpen}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented) return;
          // Taken here, so the page's Escape doesn't also close a side panel.
          e.preventDefault();
          setChatHistoryOpen(false);
        }}
        className="shadow-inner-right hidden h-full w-[300px] shrink-0 flex-col items-start justify-start gap-4 border-r-[1px] border-slate-300 lg:flex"
      >
        <SidebarHeader
          hideId={CONVERSATIONS_HIDE_ID}
          headingId={SIDEBAR_HEADING_ID}
          onHide={() => setChatHistoryOpen(false)}
          onNewChat={onNewChat}
          Heading="h2"
        />
        {list()}
        <SiteLinks />
      </aside>
      <div className="lg:hidden">
        <Sheet
          open={!!chatHistoryOpen && !isLargeScreen}
          onOpenChange={(open) => {
            if (isLargeScreen) return;
            setChatHistoryOpen(open);
          }}
        >
          <SheetContent
            side="left"
            showClose={false}
            aria-describedby={undefined}
            className="flex lg:hidden"
            onCloseAutoFocus={(e) => {
              // Back to the toggle that opened the list, or to the message
              // box of the chat just started or picked.
              e.preventDefault();
              if (focusComposerOnClose.current) {
                focusComposerOnClose.current = false;
                focusComposer();
              } else {
                focusConversationsToggle();
              }
            }}
          >
            <SidebarHeader
              onHide={() => setChatHistoryOpen(false)}
              onNewChat={() => {
                focusComposerOnClose.current = true;
                onNewChat();
                setChatHistoryOpen(false);
              }}
              Heading={SheetTitle}
            />
            {list(() => {
              focusComposerOnClose.current = true;
              setChatHistoryOpen((o) => !o);
            })}
            <SiteLinks />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
