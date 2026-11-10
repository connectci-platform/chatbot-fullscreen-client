import { parseAsBoolean, useQueryState } from "nuqs";

/** Whether the conversations sidebar is open, kept in the URL. */
export function useConversationsOpen() {
  return useQueryState("chatHistoryOpen", parseAsBoolean.withDefault(false));
}
