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

/** What Retry and Edit send for a stored upload. The agent reads only the id. */
export type ResendRef = { type: "attachment"; id: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** The agent adds these to a saved question when it leaves a file out. */
const NOT_SHARED_PREFIX = "[Not shared: ";

/**
 * Text the person typed. The agent's "[Not shared: ...]" notes are text
 * blocks too, but they aren't the person's words, so the bubble, Copy and
 * resend leave them out.
 */
export function isTypedText(
  value: unknown,
): value is { type: "text"; text: string } {
  return (
    isRecord(value) &&
    value.type === "text" &&
    typeof value.text === "string" &&
    !value.text.startsWith(NOT_SHARED_PREFIX)
  );
}

/** The sentences the agent gave for files it left out of a saved question. */
export function notSharedNotes(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const notes: string[] = [];
  for (const block of content) {
    if (
      isRecord(block) &&
      block.type === "text" &&
      typeof block.text === "string" &&
      block.text.startsWith(NOT_SHARED_PREFIX)
    ) {
      notes.push(
        block.text
          .slice(NOT_SHARED_PREFIX.length)
          .replace(/\]\s*$/, "")
          .trim(),
      );
    }
  }
  return notes;
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
): Array<{ type: "text"; text: string } | ResendRef> {
  if (!Array.isArray(content)) return [];
  const out: Array<{ type: "text"; text: string } | ResendRef> = [];
  for (const block of content) {
    if (isAttachmentRef(block)) {
      out.push({ type: "attachment", id: block.id });
    } else if (isTypedText(block)) {
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

/** "12 B", "2 KB", "1.5 MB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = unit === 0 ? value : Math.round(value * 10) / 10;
  return `${shown} ${units[unit]}`;
}

/** "1.5 MB · 12 pages", from what a block says about its file. */
export function fileDetail({
  size,
  pages,
}: {
  size?: number;
  pages?: number;
}): string | undefined {
  const parts: string[] = [];
  if (typeof size === "number" && size >= 0) parts.push(formatBytes(size));
  if (typeof pages === "number" && pages > 0) {
    parts.push(pages === 1 ? "1 page" : `${pages} pages`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}
