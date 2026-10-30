import { parseAsBoolean } from "nuqs";

// Tool calls are hidden unless the user turns them on, which writes
// `?hideToolCalls=false`. Shared so the toggle and the message list can't
// disagree about the default.
export const hideToolCallsParser = parseAsBoolean.withDefault(true);
