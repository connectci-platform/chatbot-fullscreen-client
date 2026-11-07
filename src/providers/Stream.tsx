import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { type Message } from "@langchain/langgraph-sdk";
import {
  uiMessageReducer,
  isUIMessage,
  isRemoveUIMessage,
  type UIMessage,
  type RemoveUIMessage,
} from "@langchain/langgraph-sdk/react-ui";
import { useQueryState } from "nuqs";
import { getApiKey } from "@/lib/api-key";
import { resolveApiUrl } from "@/lib/resolve-api-url";
import { program } from "@/config/program";
import { exchangeHandoffToken } from "@/lib/handoff";
import {
  isRequiresAuthEvent,
  showRequiresAuth,
  type RequiresAuthEvent,
} from "@/lib/requires-auth";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import { shouldReloadAfterSignIn } from "@/lib/run-errors";
import { isRunStatusEvent, type RunStatusEvent } from "@/lib/run-status";
import { claimThread, clearClaimKey } from "@/lib/thread-claim";
import { createClient } from "./client";
import { useThreads } from "./Thread";
import { toast } from "sonner";

export type StateType = { messages: Message[]; ui?: UIMessage[] };

const useTypedStream = useStream<
  StateType,
  {
    UpdateType: {
      messages?: Message[] | Message | string;
      ui?: (UIMessage | RemoveUIMessage)[] | UIMessage | RemoveUIMessage;
      context?: Record<string, unknown>;
    };
    CustomEventType:
      UIMessage | RemoveUIMessage | RequiresAuthEvent | RunStatusEvent;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream> & {
  apiUrl: string;
  runStatus: RunStatusEvent | null;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  authScheme?: string,
): Promise<boolean> {
  try {
    const headers = new Headers();
    if (apiKey) headers.set("X-Api-Key", apiKey);
    if (authScheme) headers.set("X-Auth-Scheme", authScheme);

    // The ACCESS agent is LangGraph-compatible but doesn't implement the
    // LangGraph-server /info endpoint; it exposes /health instead. apiUrl is
    // the agent's /api/v1 mount, so this resolves to /api/v1/health.
    // No identity needed, so no token.
    const res = await fetch(`${apiUrl}/health`, { headers });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

/**
 * Handles the widget->fullscreen handoff: a one-time `?h=<token>` is
 * exchanged for a thread_id, which is then seeded into the same
 * `threadId` query state the rest of the app already uses to resume a
 * conversation. Runs at most once per token value — the `h` param is
 * stripped as soon as the exchange settles (success or failure) so a
 * remount/refresh never retries an already-consumed token. It is kept only
 * when the exchange was never sent, so a reload can still use it.
 */
function useHandoffExchange(apiUrl: string | undefined) {
  const [handoffToken, setHandoffToken] = useQueryState("h");
  const [threadId, setThreadId] = useQueryState("threadId");
  const attemptedForToken = useRef<string | null>(null);

  useEffect(() => {
    if (!handoffToken || !apiUrl) return;
    if (attemptedForToken.current === handoffToken) return;
    if (threadId) {
      // A handoff left over from an earlier failed exchange, after the user
      // started another conversation. Exchanging it now would replace that
      // conversation.
      setHandoffToken(null);
      return;
    }
    attemptedForToken.current = handoffToken;

    exchangeHandoffToken(apiUrl, handoffToken).then((result) => {
      if (result.status === "not_sent") {
        toast.error(result.message, { richColors: true, closeButton: true });
        return;
      }
      if (result.threadId) {
        setThreadId(result.threadId);
      } else {
        toast.error(
          "We couldn't open that conversation. Please start a new one.",
          {
            richColors: true,
            closeButton: true,
          },
        );
      }
      // Strip `?h=` once the exchange is settled: the agent may have spent
      // the token, so leaving it in the URL would only cause a doomed retry
      // on refresh. A signed-out refusal ("not_sent") returned above keeps it.
      setHandoffToken(null);
    });
  }, [handoffToken, apiUrl, threadId, setThreadId, setHandoffToken]);
}

const StreamSession = ({
  children,
  apiKey,
  apiUrl,
  assistantId,
  authScheme,
}: {
  children: ReactNode;
  apiKey: string | null;
  apiUrl: string;
  assistantId: string;
  authScheme?: string;
}) => {
  const [threadId, setThreadId] = useQueryState("threadId");
  const { getThreads, setThreads } = useThreads();
  const [runStatus, setRunStatus] = useState<RunStatusEvent | null>(null);
  // A Client of our own rather than useStream's apiUrl/apiKey options, so the
  // stream and history requests carry the Bearer token (see createClient).
  const client = useMemo(
    () => createClient(apiUrl, apiKey ?? undefined, authScheme),
    [apiUrl, apiKey, authScheme],
  );
  const streamValue = useTypedStream({
    client,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onCustomEvent: (event, options) => {
      if (isRequiresAuthEvent(event)) {
        showRequiresAuth(event);
        return;
      }
      if (isRunStatusEvent(event)) {
        // A new object each time, so a repeated line still reaches effects.
        setRunStatus({ ...event });
        return;
      }
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      setThreadId(id);
    },
    // The agent lists a user's threads from turn reports written when a turn
    // ends, so a new thread only shows up in the sidebar once its run finishes.
    // Zero-arity on purpose: declaring a parameter makes useStream refetch the
    // thread state after every run.
    onFinish: () => {
      getThreads().then(setThreads).catch(console.error);
    },
  });

  // A conversation that 404ed while signed out may be the person's own. When
  // they sign in, reload: the URL keeps ?threadId=, so it opens signed in.
  // No loop: after the reload auth goes unknown -> signed_in.
  const authStatus = useAuthStatus();
  const prevAuthStatus = useRef(authStatus);
  useEffect(() => {
    if (
      shouldReloadAfterSignIn(
        prevAuthStatus.current,
        authStatus,
        streamValue.error,
      )
    ) {
      window.location.reload();
    }
    prevAuthStatus.current = authStatus;
  }, [authStatus, streamValue.error]);

  // The sidebar lists conversations linked to the account, so link the open
  // one on sign-in rather than on the next message. Waits for a run to end, so
  // that run's turn report exists to be linked. Not for threads started while
  // signed in: those already belong to the user.
  const claimOnSignIn = useRef(true);
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (authStatus === "signed_out") {
      // Also covers a session that ended without the logout link being used.
      if (wasSignedIn.current) clearClaimKey();
      wasSignedIn.current = false;
      claimOnSignIn.current = true;
      return;
    }
    if (authStatus !== "signed_in") return;
    wasSignedIn.current = true;
    if (streamValue.isLoading) return;
    if (!claimOnSignIn.current) return;
    claimOnSignIn.current = false;
    if (!threadId) return;
    claimThread(apiUrl, threadId).then((claimed) => {
      if (claimed) getThreads().then(setThreads).catch(console.error);
    });
  }, [
    authStatus,
    streamValue.isLoading,
    threadId,
    apiUrl,
    getThreads,
    setThreads,
  ]);

  // Covers every way a run ends: finished, failed or cancelled.
  useEffect(() => {
    if (!streamValue.isLoading) setRunStatus(null);
  }, [streamValue.isLoading]);

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, authScheme).then((ok) => {
      if (!ok) {
        console.error(`Failed to connect to ${apiUrl}`);
        toast.error(`${program.name} isn't available right now`, {
          description: "Please try again in a few minutes.",
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, authScheme]);

  return (
    <StreamContext.Provider value={{ ...streamValue, apiUrl, runStatus }}>
      {children}
    </StreamContext.Provider>
  );
};

export const StreamProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Get environment variables
  const envApiUrl: string | undefined = process.env.NEXT_PUBLIC_API_URL;
  const envAssistantId: string | undefined =
    process.env.NEXT_PUBLIC_ASSISTANT_ID;
  const envAuthScheme: string | undefined = process.env.NEXT_PUBLIC_AUTH_SCHEME;

  // Use URL params with env var fallbacks
  const [apiUrl] = useQueryState("apiUrl", {
    defaultValue: envApiUrl || "",
  });
  const [assistantId] = useQueryState("assistantId", {
    defaultValue: envAssistantId || "",
  });
  const [authScheme] = useQueryState("authScheme", {
    defaultValue: envAuthScheme || "",
  });

  const finalApiUrl = resolveApiUrl(apiUrl, envApiUrl);
  const finalAssistantId = assistantId || envAssistantId;
  const finalAuthScheme = authScheme || envAuthScheme || "";

  const apiKey = useMemo(() => getApiKey(finalApiUrl) || "", [finalApiUrl]);

  // Exchange a one-time `?h=` handoff token (minted by the widget) for a
  // thread_id, seeded into `threadId` so useStream resumes that
  // conversation. Only needs `finalApiUrl` (from env, typically), so this
  // runs even before the config-check fallback below would otherwise be
  // satisfied.
  useHandoffExchange(finalApiUrl || undefined);

  // Deployed app config comes entirely from env (NEXT_PUBLIC_API_URL /
  // NEXT_PUBLIC_ASSISTANT_ID) and identity from the support sign-in — there is
  // no user-facing setup step. If either is genuinely missing, the deploy is
  // misconfigured; show a neutral message instead of a form.
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="text-muted-foreground max-w-md text-center">
          {program.name} is not configured. Please contact support.
        </p>
      </div>
    );
  }

  return (
    <StreamSession
      apiKey={apiKey}
      apiUrl={finalApiUrl}
      assistantId={finalAssistantId}
      authScheme={finalAuthScheme || undefined}
    >
      {children}
    </StreamSession>
  );
};

// Create a custom hook to use the context
export const useStreamContext = (): StreamContextType => {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error("useStreamContext must be used within a StreamProvider");
  }
  return context;
};

export default StreamContext;
