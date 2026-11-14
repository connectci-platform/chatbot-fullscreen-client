import { Message } from "@langchain/langgraph-sdk";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { getContentString } from "../utils";
import { MultimodalPreview } from "@/components/thread/MultimodalPreview";
import { FileChip } from "@/components/thread/FileChip";
import { useStoredImage } from "@/hooks/use-stored-image";
import { isBase64ContentBlock } from "@/lib/multimodal-utils";
import {
  fileDetail,
  isAttachmentRef,
  type AttachmentRef,
} from "@/lib/upload-blocks";
import { useStreamContext } from "@/providers/Stream";

/** A stored image, fetched from the thread's attachments. */
function StoredImageThumb({
  threadId,
  file,
}: {
  threadId: string;
  file: AttachmentRef;
}) {
  const name = file.name || "Image";
  const { src, missing, failed } = useStoredImage(threadId, file.id);
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        className="h-16 w-16 rounded-md object-cover text-lg"
        width={32}
        height={32}
      />
    );
  }
  if (missing || failed) {
    return (
      <div className="flex max-w-48 items-start gap-2 rounded-md border bg-gray-100 px-3 py-2 text-gray-500">
        <ImageOff
          className="h-5 w-5 flex-shrink-0"
          aria-hidden
        />
        <div className="flex min-w-0 flex-col">
          <span className="text-xs">
            {missing ? "Image no longer available" : "Couldn't load this image"}
          </span>
          <span className="text-sm break-all text-gray-800">{name}</span>
        </div>
      </div>
    );
  }
  return (
    <div
      className="h-16 w-16 animate-pulse rounded-md bg-gray-100"
      role="status"
      aria-label={`Loading ${name}`}
    />
  );
}

/** A file the agent stored with this question. Only images fetch anything. */
function SharedFile({
  threadId,
  file,
}: {
  threadId: string | null;
  file: AttachmentRef;
}) {
  const image =
    file.kind === "image" ||
    (!file.kind && !!file.mime_type?.startsWith("image/"));
  if (image && threadId) {
    return (
      <StoredImageThumb
        threadId={threadId}
        file={file}
      />
    );
  }
  return (
    <FileChip
      name={file.name || "Shared file"}
      detail={fileDetail(file)}
    />
  );
}

// Questions have no copy button. It cluttered every question, and Up in the
// message box brings an earlier question back (D8-3060).
export function HumanMessage({ message }: { message: Message }) {
  const { threadId } = useStreamContext();
  const contentString = getContentString(message.content);

  return (
    <div
      // The thread scrolls a just-sent question to the top by this id.
      data-message-id={message.id}
      className="ml-auto flex items-center gap-2"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          {/* Files: as sent until the history reloads, then as stored. */}
          {Array.isArray(message.content) && message.content.length > 0 && (
            <div className="flex flex-wrap items-end justify-end gap-2">
              {message.content.reduce<React.ReactNode[]>((acc, block, idx) => {
                if (isAttachmentRef(block)) {
                  acc.push(
                    <SharedFile
                      key={idx}
                      threadId={threadId}
                      file={block}
                    />,
                  );
                } else if (isBase64ContentBlock(block)) {
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
