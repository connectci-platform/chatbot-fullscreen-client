import React from "react";
import { MultimodalPreview } from "./MultimodalPreview";
import { FileChip } from "./FileChip";
import { cn } from "@/lib/utils";
import { ContentBlock } from "@langchain/core/messages";
import type { UploadBlock } from "@/hooks/use-file-upload";
import { fileDetail, type AttachmentRef } from "@/lib/upload-blocks";

interface ContentBlocksPreviewProps {
  blocks: UploadBlock[];
  /** Files stored in this thread, by id, to name the ones Edit put back. */
  sharedFiles?: ReadonlyMap<string, AttachmentRef>;
  onRemove: (idx: number) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Renders a preview of content blocks with optional remove functionality.
 * Uses cn utility for robust class merging.
 */
export const ContentBlocksPreview: React.FC<ContentBlocksPreviewProps> = ({
  blocks,
  sharedFiles,
  onRemove,
  size = "md",
  className,
}) => {
  if (!blocks.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2 p-3.5 pb-0", className)}>
      {blocks.map((block, idx) => {
        if (block.type === "attachment") {
          const shared = sharedFiles?.get(block.id);
          return (
            <FileChip
              key={idx}
              name={shared?.name || "Shared file"}
              detail={shared && fileDetail(shared)}
              removable
              onRemove={() => onRemove(idx)}
              size={size}
            />
          );
        }
        return (
          <MultimodalPreview
            key={idx}
            block={block as unknown as ContentBlock.Multimodal.Data}
            removable
            onRemove={() => onRemove(idx)}
            size={size}
          />
        );
      })}
    </div>
  );
};
