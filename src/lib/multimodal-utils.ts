import { ContentBlock } from "@langchain/core/messages";
import {
  IMAGE_MIME_TYPES,
  TEXT_FILE_EXTENSIONS,
  formatLimit,
  type UploadLimits,
} from "@/config/uploads";
import { resizeImage } from "@/lib/image-resize";
import type { FileBlock, ImageBlock } from "@/lib/upload-blocks";

export type FileKind = "image" | "pdf" | "text";

export const NOT_A_TEXT_FILE = "That doesn't look like a text file.";

export function textFileExtension(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return (TEXT_FILE_EXTENSIONS as readonly string[]).includes(
    name.slice(dot + 1).toLowerCase(),
  );
}

/** What kind of upload a file is, or null when it is not accepted. */
export function fileKind(file: File): FileKind | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "image";
  }
  if (file.type === "application/pdf") return "pdf";
  if (textFileExtension(file.name)) return "text";
  return null;
}

/**
 * Turns a picked file into a block to send, or throws an Error whose message
 * is ready to show. Images are resized; the size limit applies to the file as
 * picked.
 */
export async function fileToContentBlock(
  file: File,
  limits: UploadLimits,
): Promise<ImageBlock | FileBlock> {
  const kind = fileKind(file);
  if (!kind) {
    throw new Error(
      `${file.name} isn't a supported file. Share an image, a PDF, or a text file.`,
    );
  }
  const max = {
    image: limits.maxImageBytes,
    pdf: limits.maxPdfBytes,
    text: limits.maxTextBytes,
  }[kind];
  if (file.size > max) {
    const noun = { image: "Images", pdf: "PDFs", text: "Text files" }[kind];
    throw new Error(
      `${file.name} is too large. ${noun} can be up to ${formatLimit(max)}.`,
    );
  }

  if (kind === "image") {
    const { data, mimeType } = await resizeImage(file);
    return { type: "image", mimeType, data, metadata: { name: file.name } };
  }

  if (kind === "text") {
    const bytes = new Uint8Array(await readArrayBuffer(file));
    if (bytes.includes(0)) throw new Error(NOT_A_TEXT_FILE);
    return {
      type: "file",
      mimeType: "text/plain",
      data: await fileToBase64(file),
      metadata: { filename: file.name },
    };
  }

  return {
    type: "file",
    mimeType: "application/pdf",
    data: await fileToBase64(file),
    metadata: { filename: file.name },
  };
}

function readArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Helper to convert File to base64 string
export async function fileToBase64(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data:...;base64, prefix
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Type guard for Base64ContentBlock
export function isBase64ContentBlock(
  block: unknown,
): block is ContentBlock.Multimodal.Data {
  if (typeof block !== "object" || block === null || !("type" in block))
    return false;
  // file type (legacy)
  if (
    (block as { type: unknown }).type === "file" &&
    "mimeType" in block &&
    typeof (block as { mimeType?: unknown }).mimeType === "string" &&
    ((block as { mimeType: string }).mimeType.startsWith("image/") ||
      (block as { mimeType: string }).mimeType === "application/pdf")
  ) {
    return true;
  }
  // image type (new)
  if (
    (block as { type: unknown }).type === "image" &&
    "mimeType" in block &&
    typeof (block as { mimeType?: unknown }).mimeType === "string" &&
    (block as { mimeType: string }).mimeType.startsWith("image/")
  ) {
    return true;
  }
  return false;
}
