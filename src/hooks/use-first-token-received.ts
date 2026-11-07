import { useEffect, useRef, useState } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import type { RunStatusEvent } from "@/lib/run-status";

/**
 * Whether the answer has started, which hides the loading indicator. A new AI
 * message sets it. A status event clears it, so the indicator comes back when
 * a tool starts after the model has already written text.
 */
export function useFirstTokenReceived(
  messages: Message[],
  runStatus: RunStatusEvent | null,
) {
  const [firstTokenReceived, setFirstTokenReceived] = useState(false);

  // TODO: this should be part of the useStream hook
  const prevMessageLength = useRef(0);
  useEffect(() => {
    if (
      messages.length !== prevMessageLength.current &&
      messages?.length &&
      messages[messages.length - 1].type === "ai"
    ) {
      setFirstTokenReceived(true);
    }

    prevMessageLength.current = messages.length;
  }, [messages]);

  useEffect(() => {
    if (runStatus) setFirstTokenReceived(false);
  }, [runStatus]);

  return [firstTokenReceived, setFirstTokenReceived] as const;
}
