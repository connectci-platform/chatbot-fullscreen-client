import { base64Bytes } from "@/lib/upload-blocks";

export const COULDNT_READ_IMAGE =
  "Couldn't read that image. Try a PNG or JPEG.";

/**
 * Shrinks an image to at most `maxEdge` px on the long edge and re-encodes it
 * as PNG, or as JPEG when the PNG is over `pngMaxBytes`. This only saves upload
 * bandwidth; the agent resizes again. GIF and WebP come out as their first
 * frame, so everything sent is PNG or JPEG.
 */
export async function resizeImage(
  file: File,
  maxEdge = 1600,
  pngMaxBytes = 2_000_000,
): Promise<{ data: string; mimeType: "image/png" | "image/jpeg" }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(COULDNT_READ_IMAGE);
  }
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(COULDNT_READ_IMAGE);
    ctx.drawImage(bitmap, 0, 0, width, height);

    const png = base64Part(canvas.toDataURL("image/png"));
    if (base64Bytes(png) <= pngMaxBytes) {
      return { data: png, mimeType: "image/png" };
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

function base64Part(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}
