import { Message } from "@langchain/langgraph-sdk";
import { getContentString } from "../utils";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";

// Questions have no copy button. It cluttered every question, and Up in the
// message box brings an earlier question back (D8-3060).
export function HumanMessage({ message }: { message: Message }) {
  const contentString = getContentString(message.content);

  return (
    <div
      // The thread scrolls a just-sent question to the top by this id.
      data-message-id={message.id}
      className="ml-auto flex items-center gap-2"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          {/* Render images and files if no text */}
          {Array.isArray(message.content) && message.content.length > 0 && (
            <div className="flex flex-wrap items-end justify-end gap-2">
              {message.content.reduce<React.ReactNode[]>((acc, block, idx) => {
                if (isBase64ContentBlock(block)) {
                  acc.push(
                    <MultimodalPreview
                      key={idx}
                      block={block}
                      size="md"
                    />,
                  );
                }
                return acc;
              }, [])}
            </div>
          )}
          {/* Render text if present, otherwise fallback to file/image name */}
          {contentString ? (
            <p className="bg-muted ml-auto w-fit rounded-lg px-4 py-2 text-right whitespace-pre-wrap">
              {contentString}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
