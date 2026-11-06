/** The agent's progress line for a running turn, such as "Searching software...". */
export type RunStatusEvent = {
  type: "status";
  message: string;
};

export function isRunStatusEvent(event: unknown): event is RunStatusEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    (event as { type?: unknown }).type === "status" &&
    typeof (event as { message?: unknown }).message === "string"
  );
}
