import { isPreviewId, type ConfirmBlock } from "@/lib/confirm";

export type { ConfirmBlock };

/** Local block types. They don't type-check against the SDK's union. */
export type ImageBlock = {
  type: "image";
  mimeType: string;
  data: string;
  metadata: { name: string };
};

export type FileBlock = {
  type: "file";
  mimeType: "application/pdf" | "text/plain";
  data: string;
  metadata: { filename: string };
};

/** A stored upload in this thread, as the agent saves it in a question. */
export interface AttachmentRef {
  type: "attachment";
  id: string;
  kind?: "image" | "pdf" | "text";
  name?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  size?: number;
  pages?: number;
  est_tokens?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isAttachmentRef(value: unknown): value is AttachmentRef {
  return (
    isRecord(value) && value.type === "attachment" && isPreviewId(value.id)
  );
}

export function isFileBlock(value: unknown): value is FileBlock {
  return (
    isRecord(value) &&
    value.type === "file" &&
    (value.mimeType === "application/pdf" || value.mimeType === "text/plain")
  );
}

/**
 * What Retry and Edit send for a saved question: its typed text, and each
 * stored upload as a bare `{type, id}` reference. Other blocks are dropped.
 */
export function toResendBlocks(
  content: unknown,
): Array<{ type: "text"; text: string } | { type: "attachment"; id: string }> {
  if (!Array.isArray(content)) return [];
  const out: Array<
    { type: "text"; text: string } | { type: "attachment"; id: string }
  > = [];
  for (const block of content) {
    if (isAttachmentRef(block)) {
      out.push({ type: "attachment", id: block.id });
    } else if (
      isRecord(block) &&
      block.type === "text" &&
      typeof block.text === "string"
    ) {
      out.push({ type: "text", text: block.text });
    }
  }
  return out;
}

/** Decoded size of a base64 string. */
export function base64Bytes(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}
