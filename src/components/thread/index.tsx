import { v4 as uuidv4 } from "uuid";
import { Fragment, useCallback, useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useStreamContext } from "@/providers/Stream";
import { useState, FormEvent } from "react";
import { Button } from "../ui/button";
import { Message } from "@langchain/langgraph-sdk";
import { AssistantMessage, AssistantMessageLoading } from "./messages/ai";
import { HumanMessage } from "./messages/human";
import {
  DO_NOT_RENDER_ID_PREFIX,
  ensureToolCallsHaveResponses,
} from "@/lib/ensure-tool-responses";
import { ProgramLogo } from "./program-logo";
import { program } from "@/config/program";
import { ChatDisclaimer } from "./chat-disclaimer";
import { StarterQuestions } from "./starter-questions";
import { OfficeHours } from "./office-hours";
import { useOfficeHours } from "@/hooks/useOfficeHours";
import { getSupportUrl } from "@/lib/agent-token";
import { TooltipIconButton } from "./tooltip-icon-button";
import {
  ArrowUp,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  Plus,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import ThreadHistory from "./history";
import { toast } from "sonner";
import {
  isTurnstileChallenge,
  runErrorMessage,
  runErrorToastOptions,
} from "@/lib/run-errors";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import {
  questionParts,
  useRestoreQuestion,
} from "@/hooks/use-restore-question";
import {
  cutOffNote,
  stopReason,
  withFailedTurnMarked,
  cutOffKey,
  reloadCutOffs,
  rememberReloadCutOff,
  withReloadCutOffsMarked,
  unansweredQuestion,
  withoutUnansweredTurn,
} from "@/lib/stopped-answer";
import { StoppedNote } from "./stopped-note";
import { TurnstileChallengePanel } from "./turnstile-challenge";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SidePanel } from "./side-panel";
import { Label } from "../ui/label";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useInitialQuestion } from "@/hooks/use-initial-question";
import { useFirstTokenReceived } from "@/hooks/use-first-token-received";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import { useArtifactOpen, useArtifactContext } from "./artifact";
import { RegistrationPanel } from "./registration-panel";
import { SoftwareComparisonPanel } from "./software-comparison-panel";
import { XdmodChartPanel } from "./xdmod-chart-panel";
import { COMPOSER_ID, focusComposer } from "./composer";
import { chartViewsByMessage } from "@/lib/xdmod-chart";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { ScrollToBottomButton } from "./scroll-to-bottom";
import { comparisonsByMessage } from "@/lib/software-comparison";

export function Thread() {
  const [artifactContext, setArtifactContext] = useArtifactContext();
  const [artifactOpen, closeArtifact] = useArtifactOpen();

  const [threadId, _setThreadId] = useQueryState("threadId");
  const [chatHistoryOpen, setChatHistoryOpen] = useQueryState(
    "chatHistoryOpen",
    parseAsBoolean.withDefault(false),
  );
  const [input, setInput] = useState("");
  const {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks: _resetBlocks,
    dragOver,
    handlePaste,
  } = useFileUpload({ enabled: program.features.fileUploads });
  const isLargeScreen = useMediaQuery("(min-width: 1024px)");
  // Office hours sit in the empty screen's bottom-left corner on wide screens
  // and follow the suggested questions on narrow ones. They're hidden while
  // the conversation list is open, which takes that side of the screen.
  const isXlScreen = useMediaQuery("(min-width: 1280px)");
  const supportUrl = getSupportUrl();
  const officeHours = useOfficeHours(
    supportUrl,
    program.officeHours?.affiliation ?? null,
  );

  const stream = useStreamContext();
  // Read once: a reload of this tab that cut off an answer, before this load.
  const [cutOffs] = useState(reloadCutOffs);
  // A run that timed out or failed left its answer cut off, as the agent saved
  // it, and a reload's cut-off answer isn't the person's stop.
  const messages = useMemo(
    () =>
      withReloadCutOffsMarked(
        withFailedTurnMarked(stream.messages, stream.error),
        threadId,
        cutOffs,
      ),
    [stream.messages, stream.error, threadId, cutOffs],
  );
  // Once per update, not once per message: each answer only needs its key.
  const chartViews = useMemo(() => chartViewsByMessage(messages), [messages]);
  const comparisons = useMemo(() => comparisonsByMessage(messages), [messages]);
  const [firstTokenReceived, setFirstTokenReceived] = useFirstTokenReceived(
    messages,
    stream.runStatus,
  );
  const isLoading = stream.isLoading;
  const chatScroll = useChatScroll({ threadId, contentVersion: messages });
  const challenge = isTurnstileChallenge(stream.error) ? stream.error : null;
  const awaitingCheck = !!challenge && !stream.turnstileFailed;

  useRestoreQuestion({
    failed: stream.turnstileFailed,
    input,
    getQuestion: stream.challengedQuestion,
    setInput,
    setBlocks: setContentBlocks,
  });

  const lastError = useRef<string | undefined>(undefined);

  const authStatus = useAuthStatus();

  const setThreadId = useCallback(
    (id: string | null) => {
      _setThreadId(id);

      // close artifact and reset artifact context
      closeArtifact();
      setArtifactContext({});
    },
    [_setThreadId, closeArtifact, setArtifactContext],
  );

  useEffect(() => {
    if (!stream.error) {
      lastError.current = undefined;
      return;
    }
    const { name, message } = stream.error as Error;
    const key = `${name}:${message}`;
    if (lastError.current === key) return;
    lastError.current = key;

    console.error(stream.error);
    const text = runErrorMessage(stream.error, authStatus);
    if (text) {
      toast.error(
        text,
        runErrorToastOptions(stream.error, () => setThreadId(null)),
      );
    }
  }, [stream.error, authStatus, setThreadId]);

  // Set by Edit: sending the edited question replaces the unanswered one.
  const replaceOnSend = useRef(false);
  useEffect(() => {
    replaceOnSend.current = false;
  }, [threadId]);

  /**
   * Sends a question. `replacing` is for Retry and Edit on an unanswered
   * question: the new one takes that turn's place, on screen and in the
   * thread the agent keeps, instead of following it.
   */
  const submitMessage = (
    text: string,
    blocks: typeof contentBlocks,
    { replacing = false }: { replacing?: boolean } = {},
  ) => {
    setFirstTokenReceived(false);
    replaceOnSend.current = false;
    const kept = (all: Message[]) =>
      replacing
        ? withoutUnansweredTurn(withFailedTurnMarked(all, stream.error))
        : all;

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(text.trim().length > 0 ? [{ type: "text", text }] : []),
        ...blocks,
      ] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(kept(stream.messages));
    chatScroll.scrollToQuestion();

    const context =
      Object.keys(artifactContext).length > 0 ? artifactContext : undefined;

    stream.submit(
      { messages: [...toolMessages, newHumanMessage], context },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        ...(replacing && { context: { replace_stopped_turn: true } }),
        optimisticValues: (prev) => ({
          ...prev,
          context,
          messages: [
            ...kept(prev.messages ?? []),
            ...toolMessages,
            newHumanMessage,
          ],
        }),
      },
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (
      (input.trim().length === 0 && contentBlocks.length === 0) ||
      isLoading ||
      awaitingCheck
    )
      return;
    submitMessage(input, contentBlocks, {
      replacing: replaceOnSend.current && !!unanswered,
    });
    setInput("");
    setContentBlocks([]);
  };

  /** A one-click question; held back while the Turnstile check is showing. */
  const askSuggested = (question: string) => {
    if (awaitingCheck) return;
    submitMessage(question, []);
  };

  useInitialQuestion((question) => submitMessage(question, []));

  const unanswered = unansweredQuestion({
    messages,
    isLoading,
    error: stream.error,
    interrupted: !!stream.interrupt,
    stopped: stream.stopped,
  });

  // The blocks came from this box, so they're the kind it holds.
  const unansweredParts = () => {
    if (!unanswered) return null;
    const { text, blocks } = questionParts(unanswered.question);
    return { text, blocks: blocks as unknown as typeof contentBlocks };
  };

  // Held from a Retry click until its run starts, so a double click sends once.
  const retrying = useRef(false);
  useEffect(() => {
    if (isLoading) retrying.current = false;
  }, [isLoading]);

  /** Asks the unanswered question again as a new run. */
  const retryQuestion = () => {
    const parts = unansweredParts();
    if (!parts || unanswered?.wrote || awaitingCheck || retrying.current)
      return;
    retrying.current = true;
    submitMessage(parts.text, parts.blocks, { replacing: true });
  };

  /**
   * Puts the unanswered question in the message box, unsent. A draft already
   * there is kept, with the question on a new line after it.
   */
  const editQuestion = () => {
    const parts = unansweredParts();
    if (!parts) return;
    setInput((draft) =>
      draft.trim() ? `${draft}\n${parts.text}` : parts.text,
    );
    setContentBlocks((blocks) => [...blocks, ...parts.blocks]);
    // A turn that made a change stays, so the record of it isn't lost.
    replaceOnSend.current = !unanswered?.wrote;
    focusComposer({ atEnd: true });
  };

  // Cancel goes away when the run stops, which would drop focus to the page.
  // It moves to the Stopped note's Retry, or to the message box without one.
  const retryButton = useRef<HTMLButtonElement>(null);
  const focusAfterStop = useRef(false);
  useEffect(() => {
    if (isLoading || !focusAfterStop.current) return;
    focusAfterStop.current = false;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (retryButton.current) retryButton.current.focus({ preventScroll: true });
    else focusComposer();
  });

  // The agent saves an answer the page left mid-stream as a stop; remember
  // it was a reload or a closed tab, not the Stop button.
  const lastHuman = stream.messages.findLast((m) => m.type === "human");
  const latestQuestion =
    threadId && lastHuman ? cutOffKey(threadId, lastHuman) : null;
  useEffect(() => {
    if (!isLoading || !latestQuestion) return;
    const onPageHide = () => rememberReloadCutOff(latestQuestion);
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [isLoading, latestQuestion]);

  const chatStarted = !!threadId || !!messages.length;

  const historyToggle = (!chatHistoryOpen || !isLargeScreen) && (
    <Button
      className="hover:bg-gray-100"
      variant="ghost"
      aria-label={chatHistoryOpen ? "Hide conversations" : "Show conversations"}
      onClick={() => setChatHistoryOpen((p) => !p)}
    >
      {chatHistoryOpen ? (
        <PanelRightOpen className="size-5" />
      ) : (
        <PanelRightClose className="size-5" />
      )}
    </Button>
  );
  const newConversation = (
    <TooltipIconButton
      size="lg"
      className="p-4"
      tooltip="New conversation"
      variant="ghost"
      onClick={() => setThreadId(null)}
    >
      <SquarePen className="size-5" />
    </TooltipIconButton>
  );
  const showOfficeHours = !chatStarted && !chatHistoryOpen;
  const hasNoAIOrToolMessages = !messages.find(
    (m) => m.type === "ai" || m.type === "tool",
  );

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="relative hidden lg:flex">
        <motion.div
          className="absolute z-20 h-full overflow-hidden border-r bg-white"
          style={{ width: 300 }}
          animate={
            isLargeScreen
              ? { x: chatHistoryOpen ? 0 : -300 }
              : { x: chatHistoryOpen ? 0 : -300 }
          }
          initial={{ x: -300 }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          <div
            className="relative h-full"
            style={{ width: 300 }}
          >
            <ThreadHistory />
          </div>
        </motion.div>
      </div>

      <div
        className={cn(
          "grid w-full grid-cols-[1fr_0fr] transition-all duration-500",
          artifactOpen && "grid-cols-[0fr_1fr] lg:grid-cols-[3fr_2fr]",
        )}
      >
        <motion.div
          className={cn(
            "relative flex min-w-0 flex-1 flex-col overflow-hidden",
            !chatStarted && "grid-rows-[1fr]",
          )}
          layout={isLargeScreen}
          animate={{
            marginLeft: chatHistoryOpen ? (isLargeScreen ? 300 : 0) : 0,
            width: chatHistoryOpen
              ? isLargeScreen
                ? "calc(100% - 300px)"
                : "100%"
              : "100%",
          }}
          transition={
            isLargeScreen
              ? { type: "spring", stiffness: 300, damping: 30 }
              : { duration: 0 }
          }
        >
          {/* On a wide screen the bar floats over the corners, clear of
              the centered conversation. Narrower, it's at the top of the
              conversation below and scrolls away with it. */}
          {!chatStarted && (
            <div className="absolute top-0 left-0 z-10 hidden w-full items-center justify-between gap-3 p-2 pl-4 xl:flex">
              <div>{historyToggle}</div>
            </div>
          )}
          {chatStarted && (
            <div className="absolute inset-x-0 top-0 z-10 hidden items-center justify-between gap-3 p-2 xl:flex">
              <div className="relative flex items-center justify-start gap-2">
                <div className="absolute left-0 z-10">{historyToggle}</div>
              </div>

              <div className="flex items-center gap-4">{newConversation}</div>
            </div>
          )}

          {showOfficeHours && isXlScreen && (
            <OfficeHours
              hours={officeHours}
              description={program.officeHours?.description ?? ""}
              supportUrl={supportUrl}
              className="absolute bottom-6 left-6 z-10 w-52 bg-white"
            />
          )}
          <div className="relative flex-1 overflow-hidden">
            <div
              ref={chatScroll.scrollRef}
              style={{ width: "100%", height: "100%" }}
              className={cn(
                "absolute inset-0 overflow-y-scroll px-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent",
                !chatStarted && "flex flex-col items-stretch xl:pt-[16vh]",
                // minmax(0,1fr): without it the grid column grows to fit
                // the widest unbreakable text (a long path or URL) and the
                // whole chat scrolls sideways on a phone.
                // The first row is the narrow screens' top bar.
                chatStarted &&
                  "grid grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] xl:grid-rows-[1fr_auto]",
              )}
            >
              <div
                data-testid="thread-top-bar"
                className="-mx-2 flex items-center justify-between gap-3 py-2 xl:hidden"
              >
                <div>{historyToggle}</div>
                {chatStarted && newConversation}
              </div>
              <div
                ref={chatScroll.contentRef}
                className={cn(
                  "mx-auto flex w-full max-w-3xl flex-col gap-4 xl:pt-8",
                  // At least the fade above the scroll-to-bottom band, so
                  // the last line of an answer is clear of it at the end.
                  // The empty screen keeps its space above the logo, less
                  // the top bar's row on a narrow screen.
                  chatStarted
                    ? "pb-6"
                    : "pt-[max(0px,calc(4vh-20px))] pb-16 sm:pt-[calc(16vh-20px)] xl:pt-8",
                )}
              >
                {chatStarted && (
                  <h1 className="flex pb-2">
                    <ProgramLogo size="small" />
                  </h1>
                )}
                {messages
                  .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                  .map((message, index, shownMessages) =>
                    message.type === "human" ? (
                      <HumanMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                      />
                    ) : (
                      <Fragment key={message.id || `${message.type}-${index}`}>
                        <AssistantMessage
                          message={message}
                          isLoading={isLoading}
                          onAsk={askSuggested}
                          awaitingCheck={awaitingCheck}
                          chartKey={
                            message.id
                              ? chartViews.get(message.id)?.[0]?.key
                              : undefined
                          }
                          comparisonKey={
                            message.id ? comparisons.get(message.id) : undefined
                          }
                        />
                        {/* An earlier stopped turn keeps its note; the
                            latest one's, with Retry and Edit, is below. */}
                        {stopReason(message) &&
                          shownMessages[index + 1]?.type === "human" && (
                            <p className="text-muted-foreground text-sm">
                              {cutOffNote(stopReason(message)!)}
                            </p>
                          )}
                      </Fragment>
                    ),
                  )}
                {/* Special rendering case where there are no AI/tool messages, but there is an interrupt.
                    We need to render it outside of the messages list, since there are no messages to render */}
                {hasNoAIOrToolMessages && !!stream.interrupt && (
                  <AssistantMessage
                    key="interrupt-msg"
                    message={undefined}
                    isLoading={isLoading}
                  />
                )}
                <StoppedNote
                  turn={unanswered}
                  retryRef={retryButton}
                  onRetry={retryQuestion}
                  onEdit={editQuestion}
                />
                {isLoading && !firstTokenReceived && (
                  <AssistantMessageLoading status={stream.runStatus?.message} />
                )}
                {/* Room for a new question to scroll to the top; sized by
                    useChatScroll. -mt-4 cancels the list's gap. */}
                <div
                  ref={chatScroll.spacerRef}
                  aria-hidden
                  data-testid="question-spacer"
                  className="-mt-4 shrink-0"
                />
              </div>
              <div
                ref={chatScroll.footerRef}
                className={cn(
                  "flex flex-col items-center bg-white",
                  // Pinned under the messages. The empty screen has none,
                  // and pinned on a short screen it would ride up over the
                  // top bar.
                  chatStarted ? "sticky bottom-0" : "gap-8",
                )}
              >
                {!chatStarted && (
                  <h1 className="mb-4">
                    <ProgramLogo />
                  </h1>
                )}

                {/* Tighter on a phone, where the footer would otherwise take more
                    than half of a small screen. */}
                <div className="relative mx-auto mb-2 w-full max-w-3xl sm:mb-4">
                  {chatStarted && (
                    <ScrollToBottomButton
                      visible={!chatScroll.isAtBottom}
                      onClick={() => {
                        chatScroll.scrollToBottom();
                        // The button goes away once at the end; keep focus.
                        focusComposer();
                      }}
                    />
                  )}
                  {challenge && (
                    <TurnstileChallengePanel
                      siteKey={challenge.siteKey}
                      failed={stream.turnstileFailed}
                      onVerified={stream.resendWithToken}
                      onFailed={stream.failChallenge}
                    />
                  )}
                  <div
                    ref={dropRef}
                    className={cn(
                      "relative z-10 w-full bg-white shadow-xs transition-all",
                      dragOver
                        ? "border-primary border-2 border-dotted"
                        : "border-input border border-solid",
                    )}
                  >
                    <form
                      onSubmit={handleSubmit}
                      className="mx-auto flex max-w-3xl flex-col"
                    >
                      <ContentBlocksPreview
                        blocks={contentBlocks}
                        onRemove={removeBlock}
                      />
                      {/* The box and its buttons on one row, Send inside the
                          box at the right. */}
                      <div className="flex items-end">
                        {program.features.fileUploads && (
                          <>
                            <Label
                              htmlFor="file-input"
                              className="flex size-11 shrink-0 cursor-pointer items-center justify-center"
                            >
                              <Plus className="size-5 text-gray-600" />
                              <span className="sr-only">
                                Upload PDF or Image
                              </span>
                            </Label>
                            <input
                              id="file-input"
                              type="file"
                              onChange={handleFileUpload}
                              multiple
                              accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                              className="hidden"
                            />
                          </>
                        )}
                        <textarea
                          id={COMPOSER_ID}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onPaste={handlePaste}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.shiftKey &&
                              !e.metaKey &&
                              !e.nativeEvent.isComposing
                            ) {
                              e.preventDefault();
                              const el = e.target as HTMLElement | undefined;
                              const form = el?.closest("form");
                              form?.requestSubmit();
                            }
                          }}
                          aria-label="Message"
                          placeholder="Type your message..."
                          rows={1}
                          // One line to start, growing with the question.
                          className="field-sizing-content max-h-[30dvh] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto border-none bg-transparent px-3 py-2.5 text-base leading-6 text-black shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                        />
                        {stream.isLoading ? (
                          <Button
                            key="stop"
                            type="button"
                            size="icon"
                            aria-label="Cancel"
                            onClick={() => {
                              focusAfterStop.current = true;
                              stream.stop();
                            }}
                            className="size-11 shrink-0"
                          >
                            <LoaderCircle
                              aria-hidden
                              className="size-5 animate-spin"
                            />
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            size="icon"
                            aria-label="Send"
                            className="size-11 shrink-0"
                            disabled={
                              isLoading ||
                              awaitingCheck ||
                              (!input.trim() && contentBlocks.length === 0)
                            }
                          >
                            <ArrowUp
                              aria-hidden
                              className="size-5"
                            />
                          </Button>
                        )}
                      </div>
                    </form>
                  </div>
                  <ChatDisclaimer />
                  {!chatStarted && (
                    <StarterQuestions
                      onAsk={(question) => submitMessage(question, [])}
                    />
                  )}
                  {showOfficeHours && !isXlScreen && (
                    <OfficeHours
                      hours={officeHours}
                      description={program.officeHours?.description ?? ""}
                      supportUrl={supportUrl}
                      className="mt-6"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
        <SidePanel
          open={artifactOpen}
          onClose={closeArtifact}
        />
      </div>
      <RegistrationPanel onConfirm={(text) => submitMessage(text, [])} />
      <SoftwareComparisonPanel />
      <XdmodChartPanel
        onAsk={askSuggested}
        awaitingCheck={awaitingCheck}
      />
    </div>
  );
}
