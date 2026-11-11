import type { Message } from "@langchain/langgraph-sdk";

export type Json = Record<string, unknown>;

function contentText(content: Message["content"]): string | null {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((block) =>
      block && typeof block === "object" && "text" in block
        ? String((block as { text: unknown }).text)
        : "",
    )
    .join("");
  return text || null;
}

/** The tool's JSON body, or null for a failed, refused or unreadable call. */
export function toolResult(message: Message): Json | null {
  if (message.type !== "tool") return null;
  if ((message as { status?: string }).status === "error") return null;
  const text = contentText(message.content);
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const result = parsed as Json;
    return result.status === "error" ? null : result;
  } catch {
    return null;
  }
}
