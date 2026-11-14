import {
  useState,
  useRef,
  useEffect,
  useCallback,
  ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toast } from "sonner";
import {
  ANONYMOUS_LIMITS,
  SIGNED_IN_LIMITS,
  formatLimit,
} from "@/config/uploads";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import { fileKind, fileToContentBlock } from "@/lib/multimodal-utils";
import {
  base64Bytes,
  type FileBlock,
  type ImageBlock,
  type ResendRef,
} from "@/lib/upload-blocks";

/**
 * What the message box holds: files picked here, and references to files
 * already stored in the thread, which Edit puts back.
 */
export type UploadBlock = ImageBlock | FileBlock | ResendRef;

interface UseFileUploadOptions {
  initialBlocks?: UploadBlock[];
  enabled?: boolean;
}

/** Bytes that will go on the wire for a block. A reference is only an id. */
function blockBytes(b: UploadBlock): number {
  return b.type === "attachment" ? 0 : base64Bytes(b.data);
}

export function useFileUpload({
  initialBlocks = [],
  enabled = true,
}: UseFileUploadOptions = {}) {
  const [contentBlocks, setContentBlocksState] =
    useState<UploadBlock[]>(initialBlocks);
  // Kept in step with the state so several intakes in a row (a drop, then a
  // paste) each see the files the one before added.
  const blocksRef = useRef(contentBlocks);
  const setContentBlocks: Dispatch<SetStateAction<UploadBlock[]>> = useCallback(
    (action) => {
      blocksRef.current =
        typeof action === "function" ? action(blocksRef.current) : action;
      setContentBlocksState(blocksRef.current);
    },
    [],
  );
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);
  const signedIn = useAuthStatus() === "signed_in";
  const limits = signedIn ? SIGNED_IN_LIMITS : ANONYMOUS_LIMITS;

  const tooManyFilesMessage = () =>
    signedIn
      ? `You can share up to ${limits.maxFiles} files in one message.`
      : `You can share up to ${limits.maxFiles} files in one message. Sign in to share up to ${SIGNED_IN_LIMITS.maxFiles}.`;

  /** The one intake for the picker, drop and paste. */
  const acceptFiles = useCallback(
    async (files: File[]): Promise<void> => {
      for (const file of files) {
        const current = blocksRef.current;
        const kind = fileKind(file);
        if (!kind) {
          toast.error(
            `${file.name} isn't a supported file. Share an image, a PDF, or a text file.`,
          );
          continue;
        }
        if (current.length >= limits.maxFiles) {
          toast.error(tooManyFilesMessage());
          break;
        }
        let block: ImageBlock | FileBlock;
        try {
          block = await fileToContentBlock(file, limits);
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Couldn't add that file.",
          );
          continue;
        }
        // Compare after processing, against the latest blocks, so the same file
        // added twice is refused once even when two intakes overlap. Different
        // files that share a name (every pasted screenshot is image.png) pass.
        if (
          blocksRef.current.some(
            (b) =>
              b.type !== "attachment" &&
              b.mimeType === block.mimeType &&
              b.data === block.data,
          )
        ) {
          toast.error(
            `${file.name} is already attached. Each file can only be added once per message.`,
          );
          continue;
        }
        const used = blocksRef.current.reduce((n, b) => n + blockBytes(b), 0);
        if (used + blockBytes(block) > limits.maxTotalBytes) {
          toast.error(
            signedIn
              ? `${file.name} would take this message over ${formatLimit(limits.maxTotalBytes)}.`
              : `${file.name} would take this message over ${formatLimit(limits.maxTotalBytes)}. Remove a file or sign in to share up to ${formatLimit(SIGNED_IN_LIMITS.maxTotalBytes)}.`,
          );
          continue;
        }
        if (blocksRef.current.length >= limits.maxFiles) continue;
        setContentBlocks((prev) => [...prev, block]);
      }
    },
    [limits, signedIn, setContentBlocks],
  );

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const picked = Array.from(files);
    e.target.value = "";
    await acceptFiles(picked);
  };

  // With uploads off, still cancel window drags so a dropped file can't
  // navigate the page away from the chat.
  useEffect(() => {
    if (enabled) return;
    const cancel = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", cancel);
    window.addEventListener("drop", cancel);
    return () => {
      window.removeEventListener("dragover", cancel);
      window.removeEventListener("drop", cancel);
    };
  }, [enabled]);

  // Drag and drop handlers
  useEffect(() => {
    if (!enabled || !dropRef.current) return;

    // Global drag events with counter for robust dragOver state
    const handleWindowDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter.current += 1;
        setDragOver(true);
      }
    };
    const handleWindowDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes("Files")) {
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          setDragOver(false);
          dragCounter.current = 0;
        }
      }
    };
    const handleWindowDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setDragOver(false);

      if (!e.dataTransfer) return;

      await acceptFiles(Array.from(e.dataTransfer.files));
    };
    const handleWindowDragEnd = (e: DragEvent) => {
      dragCounter.current = 0;
      setDragOver(false);
    };
    window.addEventListener("dragenter", handleWindowDragEnter);
    window.addEventListener("dragleave", handleWindowDragLeave);
    window.addEventListener("drop", handleWindowDrop);
    window.addEventListener("dragend", handleWindowDragEnd);

    // Prevent default browser behavior for dragover globally
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("dragover", handleWindowDragOver);

    // Remove element-specific drop event (handled globally)
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    };
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
    };
    const element = dropRef.current;
    element.addEventListener("dragover", handleDragOver);
    element.addEventListener("dragenter", handleDragEnter);
    element.addEventListener("dragleave", handleDragLeave);

    return () => {
      element.removeEventListener("dragover", handleDragOver);
      element.removeEventListener("dragenter", handleDragEnter);
      element.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragenter", handleWindowDragEnter);
      window.removeEventListener("dragleave", handleWindowDragLeave);
      window.removeEventListener("drop", handleWindowDrop);
      window.removeEventListener("dragend", handleWindowDragEnd);
      window.removeEventListener("dragover", handleWindowDragOver);
      dragCounter.current = 0;
    };
  }, [acceptFiles, enabled]);

  const removeBlock = (idx: number) => {
    setContentBlocks((prev) => prev.filter((_, i) => i !== idx));
  };

  /**
   * Puts files back in the box, as Edit does: references to stored files, or
   * files that were sent but never stored. One already there is skipped, and
   * the count limit holds, with the usual toast when some are left out.
   */
  const addBlocks = (blocks: UploadBlock[]) => {
    const next = [...blocksRef.current];
    const same = (a: UploadBlock, b: UploadBlock) =>
      a.type === "attachment" || b.type === "attachment"
        ? a.type === b.type && (a as ResendRef).id === (b as ResendRef).id
        : a.mimeType === b.mimeType && a.data === b.data;
    let leftOut = false;
    for (const block of blocks) {
      if (next.some((b) => same(b, block))) continue;
      if (next.length >= limits.maxFiles) {
        leftOut = true;
        break;
      }
      next.push(block);
    }
    if (next.length !== blocksRef.current.length) setContentBlocks(next);
    if (leftOut) toast.error(tooManyFilesMessage());
  };

  const resetBlocks = () => setContentBlocks([]);

  /**
   * Handle paste event for files (images, PDFs, text files)
   * Can be used as onPaste={handlePaste} on a textarea or input
   */
  const handlePaste = async (
    e: React.ClipboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  ) => {
    if (!enabled) return;
    const items = e.clipboardData.items;
    if (!items) return;
    // Excel, Word, PowerPoint and Numbers put a picture of the selection on
    // the clipboard next to its text. Real text means the person copied text,
    // so the default paste runs and the picture isn't taken. A browser's "Copy
    // image" adds only an html fragment, so html alone doesn't count.
    if (e.clipboardData.getData("text/plain").trim()) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) {
      return;
    }
    e.preventDefault();
    await acceptFiles(files);
  };

  return {
    contentBlocks,
    setContentBlocks,
    handleFileUpload,
    dropRef,
    removeBlock,
    resetBlocks,
    addBlocks,
    dragOver,
    handlePaste,
    acceptFiles,
  };
}
