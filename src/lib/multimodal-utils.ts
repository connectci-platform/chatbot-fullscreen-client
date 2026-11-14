import { ContentBlock } from "@langchain/core/messages";
import {
  HEIC_EXTENSIONS,
  TEXT_FILE_EXTENSIONS,
  formatLimit,
  imageType,
  type UploadLimits,
} from "@/config/uploads";
import { resizeImage } from "@/lib/image-resize";
import type { FileBlock, ImageBlock } from "@/lib/upload-blocks";

export type FileKind = "image" | "pdf" | "text";

export const NOT_A_TEXT_FILE = "That doesn't look like a text file.";

function extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function textFileExtension(name: string): boolean {
  return (TEXT_FILE_EXTENSIONS as readonly string[]).includes(extension(name));
}

const HEIC_MESSAGE =
  "HEIC photos aren't supported yet. Export it as JPEG or PNG and share that.";

/** Why a file isn't accepted, ready to show. */
export function unsupportedMessage(file: File): string {
  if (
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    (HEIC_EXTENSIONS as readonly string[]).includes(extension(file.name))
  ) {
    return HEIC_MESSAGE;
  }
  return `${file.name} isn't a supported file. Share an image, a PDF, or a text file.`;
}

/** What kind of upload a file is, or null when it is not accepted. */
export function fileKind(file: File): FileKind | null {
  if (imageType(file)) return "image";
  if (
    file.type === "application/pdf" ||
    (!file.type && extension(file.name) === "pdf")
  ) {
    return "pdf";
  }
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
    throw new Error(unsupportedMessage(file));
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
    const { data, mimeType } = await resizeImage(
      file,
      undefined,
      undefined,
      limits.maxImageBytes,
    );
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
      (block as { mimeType: string }).mimeType === "application/pdf" ||
      (block as { mimeType: string }).mimeType === "text/plain")
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
