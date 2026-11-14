import type { Message } from "@langchain/langgraph-sdk";
import { isTypedText } from "@/lib/upload-blocks";

/**
 * A message's text, as shown and copied: the text blocks the person or the
 * model wrote, joined. Files, references and the agent's "[Not shared: ...]"
 * notes are left out.
 */
export function getContentString(content: Message["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter(isTypedText)
    .map((c) => c.text)
    .join(" ");
}
