import { v4 as uuidv4 } from "uuid";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  XIcon,
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
import { unansweredQuestion } from "@/lib/stopped-answer";
import { StoppedNote } from "./stopped-note";
import { TurnstileChallengePanel } from "./turnstile-challenge";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Label } from "../ui/label";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useInitialQuestion } from "@/hooks/use-initial-question";
import { useFirstTokenReceived } from "@/hooks/use-first-token-received";
import { ContentBlocksPreview } from "./ContentBlocksPreview";
import {
  useArtifactOpen,
  ArtifactContent,
  ArtifactTitle,
  useArtifactContext,
} from "./artifact";
import { RegistrationPanel } from "./registration-panel";
import { SoftwareComparisonPanel } from "./software-comparison-panel";
import { XdmodChartPanel } from "./xdmod-chart-panel";
import { COMPOSER_ID, focusComposer } from "./composer";
import { chartViewsByMessage } from "@/lib/xdmod-chart";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { ScrollToBottomSlot } from "./scroll-to-bottom";

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
  const messages = stream.messages;
  // Once per update, not once per message: each answer only needs its key.
  const chartViews = useMemo(() => chartViewsByMessage(messages), [messages]);
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

  const submitMessage = (text: string, blocks: typeof contentBlocks) => {
    setFirstTokenReceived(false);

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: "human",
      content: [
        ...(text.trim().length > 0 ? [{ type: "text", text }] : []),
        ...blocks,
      ] as Message["content"],
    };

    const toolMessages = ensureToolCallsHaveResponses(stream.messages);
    chatScroll.scrollToQuestion();

    const context =
      Object.keys(artifactContext).length > 0 ? artifactContext : undefined;

    stream.submit(
      { messages: [...toolMessages, newHumanMessage], context },
      {
        streamMode: ["values"],
        streamSubgraphs: true,
        streamResumable: true,
        optimisticValues: (prev) => ({
          ...prev,
          context,
          messages: [
            ...(prev.messages ?? []),
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
    submitMessage(input, contentBlocks);
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
    if (!parts || awaitingCheck || retrying.current) return;
    retrying.current = true;
    submitMessage(parts.text, parts.blocks);
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
    focusComposer();
  };

  const chatStarted = !!threadId || !!messages.length;
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
          {!chatStarted && (
            <div className="absolute top-0 left-0 z-10 flex w-full items-center justify-between gap-3 p-2 pl-4">
              <div>
                {(!chatHistoryOpen || !isLargeScreen) && (
                  <Button
                    className="hover:bg-gray-100"
                    variant="ghost"
                    aria-label={
                      chatHistoryOpen
                        ? "Hide conversations"
                        : "Show conversations"
                    }
                    onClick={() => setChatHistoryOpen((p) => !p)}
                  >
                    {chatHistoryOpen ? (
                      <PanelRightOpen className="size-5" />
                    ) : (
                      <PanelRightClose className="size-5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
          {chatStarted && (
            <div className="relative z-10 flex items-center justify-between gap-3 p-2 xl:absolute xl:inset-x-0 xl:top-0">
              <div className="relative flex items-center justify-start gap-2">
                <div className="absolute left-0 z-10">
                  {(!chatHistoryOpen || !isLargeScreen) && (
                    <Button
                      className="hover:bg-gray-100"
                      variant="ghost"
                      aria-label={
                        chatHistoryOpen
                          ? "Hide conversations"
                          : "Show conversations"
                      }
                      onClick={() => setChatHistoryOpen((p) => !p)}
                    >
                      {chatHistoryOpen ? (
                        <PanelRightOpen className="size-5" />
                      ) : (
                        <PanelRightClose className="size-5" />
                      )}
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <TooltipIconButton
                  size="lg"
                  className="p-4"
                  tooltip="New conversation"
                  variant="ghost"
                  onClick={() => setThreadId(null)}
                >
                  <SquarePen className="size-5" />
                </TooltipIconButton>
              </div>

              <div className="from-background to-background/0 absolute inset-x-0 top-full h-5 bg-gradient-to-b xl:hidden" />
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
                !chatStarted &&
                  "flex flex-col items-stretch pt-[4vh] sm:pt-[16vh]",
                // minmax(0,1fr): without it the grid column grows to fit
                // the widest unbreakable text (a long path or URL) and the
                // whole chat scrolls sideways on a phone.
                chatStarted &&
                  "grid grid-cols-[minmax(0,1fr)] grid-rows-[1fr_auto]",
              )}
            >
              <div
                ref={chatScroll.contentRef}
                className={cn(
                  "mx-auto flex w-full max-w-3xl flex-col gap-4 pt-8",
                  // At least the fade above the scroll-to-bottom band, so
                  // the last line of an answer is clear of it at the end.
                  chatStarted ? "pb-6" : "pb-16",
                )}
              >
                {chatStarted && (
                  <h1 className="flex pb-2">
                    <ProgramLogo size="small" />
                  </h1>
                )}
                {messages
                  .filter((m) => !m.id?.startsWith(DO_NOT_RENDER_ID_PREFIX))
                  .map((message, index) =>
                    message.type === "human" ? (
                      <HumanMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                      />
                    ) : (
                      <AssistantMessage
                        key={message.id || `${message.type}-${index}`}
                        message={message}
                        isLoading={isLoading}
                        onAsk={askSuggested}
                        awaitingCheck={awaitingCheck}
                        chartKey={
                          message.id
                            ? chartViews.get(message.id)?.[0]?.key
                            : undefined
                        }
                      />
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
                  "sticky bottom-0 flex flex-col items-center bg-white",
                  !chatStarted && "gap-8",
                )}
              >
                {!chatStarted && (
                  <h1 className="mb-4">
                    <ProgramLogo />
                  </h1>
                )}

                {chatStarted && (
                  <ScrollToBottomSlot
                    visible={!chatScroll.isAtBottom}
                    onClick={() => {
                      chatScroll.scrollToBottom();
                      // The button goes away once at the end; keep focus.
                      focusComposer();
                    }}
                  />
                )}

                <div className="mx-auto mb-8 w-full max-w-3xl">
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
                      className="mx-auto grid max-w-3xl grid-rows-[1fr_auto] gap-2"
                    >
                      <ContentBlocksPreview
                        blocks={contentBlocks}
                        onRemove={removeBlock}
                      />
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
                        className="field-sizing-content resize-none border-none bg-transparent p-3.5 pb-0 text-base text-black shadow-none ring-0 outline-none focus:ring-0 focus:outline-none"
                      />

                      <div className="flex items-center gap-6 p-2 pt-4">
                        {program.features.fileUploads && (
                          <>
                            <Label
                              htmlFor="file-input"
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <Plus className="size-5 text-gray-600" />
                              <span className="text-sm text-gray-600">
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
                        {stream.isLoading ? (
                          <Button
                            key="stop"
                            onClick={() => stream.stop()}
                            className="ml-auto"
                          >
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            type="submit"
                            className="ml-auto shadow-md transition-all"
                            disabled={
                              isLoading ||
                              awaitingCheck ||
                              (!input.trim() && contentBlocks.length === 0)
                            }
                          >
                            Send
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
        <div
          className={cn(
            "relative flex flex-col border-l",
            !artifactOpen && "hidden",
          )}
        >
          <div className="absolute inset-0 flex min-w-[30vw] flex-col">
            <div className="grid grid-cols-[1fr_auto] border-b p-4">
              <ArtifactTitle className="truncate overflow-hidden" />
              <button
                onClick={closeArtifact}
                aria-label="Close panel"
                className="cursor-pointer"
              >
                <XIcon className="size-5" />
              </button>
            </div>
            <ArtifactContent className="relative min-h-0 flex-grow overflow-hidden" />
          </div>
        </div>
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
