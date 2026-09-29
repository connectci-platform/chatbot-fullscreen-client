import React, {
  createContext,
  useContext,
  ReactNode,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { Client, type Message } from "@langchain/langgraph-sdk";
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
import { APP_NAME } from "@/lib/branding";
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
    CustomEventType: UIMessage | RemoveUIMessage;
  }
>;

type StreamContextType = ReturnType<typeof useTypedStream> & {
  apiUrl: string;
};
const StreamContext = createContext<StreamContextType | undefined>(undefined);

async function sleep(ms = 4000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkGraphStatus(
  apiUrl: string,
  apiKey: string | null,
  authScheme?: string,
): Promise<boolean> {
  try {
    const headers = new Headers();
    if (apiKey) headers.set("X-Api-Key", apiKey);
    if (authScheme) headers.set("X-Auth-Scheme", authScheme);

    const res = await fetch(`${apiUrl}/info`, {
      headers,
      credentials: "include",
    });

    return res.ok;
  } catch (e) {
    console.error(e);
    return false;
  }
}

async function exchangeHandoffToken(
  apiUrl: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${apiUrl}/handoff/exchange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { thread_id?: string };
    return data.thread_id ?? null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * Handles the widget->fullscreen handoff: a one-time `?h=<token>` is
 * exchanged for a thread_id, which is then seeded into the same
 * `threadId` query state the rest of the app already uses to resume a
 * conversation. Runs at most once per token value — the `h` param is
 * stripped as soon as the exchange settles (success or failure) so a
 * remount/refresh never retries an already-consumed token.
 */
function useHandoffExchange(apiUrl: string | undefined) {
  const [handoffToken, setHandoffToken] = useQueryState("h");
  const [, setThreadId] = useQueryState("threadId");
  const attemptedForToken = useRef<string | null>(null);

  useEffect(() => {
    if (!handoffToken || !apiUrl) return;
    if (attemptedForToken.current === handoffToken) return;
    attemptedForToken.current = handoffToken;

    exchangeHandoffToken(apiUrl, handoffToken).then((threadId) => {
      if (threadId) {
        setThreadId(threadId);
      }
      // Always strip `?h=` once the exchange settles: the token is
      // single-use on the server regardless of outcome, so leaving it
      // in the URL would only cause a doomed retry on refresh.
      setHandoffToken(null);
    });
  }, [handoffToken, apiUrl, setThreadId, setHandoffToken]);
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
  // useStream's own apiUrl/apiKey/defaultHeaders options don't expose an
  // onRequest hook (only the underlying Client's ClientConfig does), so we
  // build the Client ourselves to force `credentials: "include"` on every
  // fetch (SSE stream + REST) — this is how the SESSaccess_auth cookie
  // reaches the agent. Passing `client` makes useStream skip its own
  // internal `new Client(...)` construction, so we replicate that here.
  const client = useMemo(
    () =>
      new Client({
        apiUrl,
        apiKey: apiKey ?? undefined,
        ...(authScheme && {
          defaultHeaders: {
            "X-Auth-Scheme": authScheme,
          },
        }),
        onRequest: (_url, init) => ({ ...init, credentials: "include" }),
      }),
    [apiUrl, apiKey, authScheme],
  );
  const streamValue = useTypedStream({
    client,
    assistantId,
    threadId: threadId ?? null,
    fetchStateHistory: true,
    onCustomEvent: (event, options) => {
      if (isUIMessage(event) || isRemoveUIMessage(event)) {
        options.mutate((prev) => {
          const ui = uiMessageReducer(prev.ui ?? [], event);
          return { ...prev, ui };
        });
      }
    },
    onThreadId: (id) => {
      setThreadId(id);
      // Refetch threads list when thread ID changes.
      // Wait for some seconds before fetching so we're able to get the new thread that was created.
      sleep().then(() => getThreads().then(setThreads).catch(console.error));
    },
  });

  useEffect(() => {
    checkGraphStatus(apiUrl, apiKey, authScheme).then((ok) => {
      if (!ok) {
        toast.error(`Failed to connect to ${APP_NAME} server`, {
          description: () => (
            <p>
              Please ensure your graph is running at <code>{apiUrl}</code> and
              your API key is correctly set (if connecting to a deployed graph).
            </p>
          ),
          duration: 10000,
          richColors: true,
          closeButton: true,
        });
      }
    });
  }, [apiKey, apiUrl, authScheme]);

  return (
    <StreamContext.Provider value={{ ...streamValue, apiUrl }}>
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
  // NEXT_PUBLIC_ASSISTANT_ID) and identity from the session cookie — there is
  // no user-facing setup step. If either is genuinely missing, the deploy is
  // misconfigured; show a neutral message instead of a form.
  if (!finalApiUrl || !finalAssistantId) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center p-4">
        <p className="text-muted-foreground max-w-md text-center">
          {APP_NAME} is not configured. Please contact support.
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
