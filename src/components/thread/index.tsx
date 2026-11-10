import { v4 as uuidv4 } from "uuid";
import { ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
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
  ArrowDown,
  LoaderCircle,
  PanelRightOpen,
  PanelRightClose,
  SquarePen,
  Plus,
} from "lucide-react";
import { useQueryState, parseAsBoolean } from "nuqs";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import ThreadHistory from "./history";
import { toast } from "sonner";
import {
  isTurnstileChallenge,
  runErrorMessage,
  runErrorToastOptions,
} from "@/lib/run-errors";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import { useRestoreQuestion } from "@/hooks/use-restore-question";
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
import { chartViewsByMessage } from "@/lib/xdmod-chart";
import { comparisonsByMessage } from "@/lib/software-comparison";

function StickyToBottomContent(props: {
  content: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const context = useStickToBottomContext();
  return (
    <div
      ref={context.scrollRef}
      style={{ width: "100%", height: "100%" }}
      className={props.className}
    >
      <div
        ref={context.contentRef}
        className={props.contentClassName}
      >
        {props.content}
      </div>

      {props.footer}
    </div>
  );
}

function ScrollToBottom(props: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  if (isAtBottom) return null;
  return (
    <Button
      variant="outline"
      className={props.className}
      onClick={() => scrollToBottom()}
    >
      <ArrowDown className="h-4 w-4" />
      <span>Scroll to bottom</span>
    </Button>
  );
}

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
  const comparisons = useMemo(() => comparisonsByMessage(messages), [messages]);
  const [firstTokenReceived, setFirstTokenReceived] = useFirstTokenReceived(
    messages,
    stream.runStatus,
  );
  const isLoading = stream.isLoading;
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

  useInitialQuestion((question) => submitMessage(question, []));

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
          <StickToBottom className="relative flex-1 overflow-hidden">
            <StickyToBottomContent
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
              contentClassName="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full"
              content={
                <>
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
                          onAsk={(question) => submitMessage(question, [])}
                          chartKey={
                            message.id
                              ? chartViews.get(message.id)?.[0]?.key
                              : undefined
                          }
                          comparisonKey={
                            message.id ? comparisons.get(message.id) : undefined
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
                  {isLoading && !firstTokenReceived && (
                    <AssistantMessageLoading
                      status={stream.runStatus?.message}
                    />
                  )}
                </>
              }
              footer={
                <div className="sticky bottom-0 flex flex-col items-center gap-8 bg-white">
                  {!chatStarted && (
                    <h1 className="mb-4">
                      <ProgramLogo />
                    </h1>
                  )}

                  {chatStarted && (
                    <ScrollToBottom className="animate-in fade-in-0 zoom-in-95 absolute bottom-full left-1/2 mb-4 -translate-x-1/2" />
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
              }
            />
          </StickToBottom>
        </motion.div>
        <SidePanel
          open={artifactOpen}
          onClose={closeArtifact}
        />
      </div>
      <RegistrationPanel onConfirm={(text) => submitMessage(text, [])} />
      <SoftwareComparisonPanel />
      <XdmodChartPanel onAsk={(text) => submitMessage(text, [])} />
    </div>
  );
}
