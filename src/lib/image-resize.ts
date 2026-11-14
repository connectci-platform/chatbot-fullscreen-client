import { imageType } from "@/config/uploads";
import { base64Bytes } from "@/lib/upload-blocks";

export const COULDNT_READ_IMAGE =
  "Couldn't read that image. Try a PNG or JPEG.";

/**
 * Prepares an image to send. A PNG or JPEG that is already within `maxEdge` px
 * on the long edge and `maxBytes` goes out as it is: re-encoding a photo as PNG
 * can make it ten times bigger. Otherwise it is shrunk to `maxEdge` and encoded
 * as JPEG when it was a JPEG, or as PNG (JPEG when the PNG is over
 * `pngMaxBytes`) for anything else. This only saves upload bandwidth; the
 * agent resizes again. GIF and WebP come out as their first frame, so
 * everything sent is PNG or JPEG.
 */
export async function resizeImage(
  file: File,
  maxEdge = 1600,
  pngMaxBytes = 2_000_000,
  maxBytes = Infinity,
): Promise<{ data: string; mimeType: "image/png" | "image/jpeg" }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(COULDNT_READ_IMAGE);
  }
  try {
    const source = imageType(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    if (
      (source === "image/png" || source === "image/jpeg") &&
      longEdge <= maxEdge &&
      file.size <= maxBytes
    ) {
      return { data: await readBase64(file), mimeType: source };
    }
    const scale = Math.min(1, maxEdge / longEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(COULDNT_READ_IMAGE);
    ctx.drawImage(bitmap, 0, 0, width, height);

    if (source !== "image/jpeg") {
      const png = base64Part(canvas.toDataURL("image/png"));
      if (base64Bytes(png) <= pngMaxBytes) {
        return { data: png, mimeType: "image/png" };
      }
    }
    // JPEG has no alpha, so put transparent pixels on white, not black.
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    return {
      data: base64Part(canvas.toDataURL("image/jpeg", 0.9)),
      mimeType: "image/jpeg",
    };
  } finally {
    bitmap.close();
  }
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(base64Part(reader.result as string));
    reader.onerror = () => reject(new Error(COULDNT_READ_IMAGE));
    reader.readAsDataURL(file);
  });
}

function base64Part(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
