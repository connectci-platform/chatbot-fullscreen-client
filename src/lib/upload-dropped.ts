/** Sent by the agent before an answer when it left some files out. */
export type UploadDroppedEvent = { type: "upload_dropped"; files: string[] };

export function isUploadDroppedEvent(
  event: unknown,
): event is UploadDroppedEvent {
  if (typeof event !== "object" || event === null) return false;
  const { type, files } = event as { type?: unknown; files?: unknown };
  return (
    type === "upload_dropped" &&
    Array.isArray(files) &&
    files.every((f) => typeof f === "string")
  );
}

/** The agent's sentences, one after another, for a toast. */
export function uploadDroppedMessage(event: UploadDroppedEvent): string {
  return event.files.join(" ");
}
