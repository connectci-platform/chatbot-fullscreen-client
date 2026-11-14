import { useEffect, useState } from "react";
import { threadGet } from "@/lib/thread-attachments";
import { useStreamContext } from "@/providers/Stream";

/**
 * `missing` is only for an image the agent says is gone (a 404). `failed` is
 * any other failure, including a payload that can't be shown: the image may
 * still be stored, so it isn't called gone.
 */
export type StoredImage = { src?: string; missing: boolean; failed?: boolean };

// The only types a data URL is built with. Whatever else a payload claims
// (an SVG could carry script) is not shown.
const SHOWN_TYPES = new Set(["image/png", "image/jpeg"]);
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

// For the page's life, so scrolling and re-renders don't fetch again. A
// failure isn't kept, so the next mount tries again; a 404 is.
const loaded = new Map<string, Promise<StoredImage>>();
// Loaded images, so a remount shows one on its first render.
const settled = new Map<string, StoredImage>();

async function fetchImage(
  apiUrl: string,
  threadId: string,
  attachmentId: string,
): Promise<StoredImage> {
  const res = await threadGet(
    apiUrl,
    threadId,
  )(`attachments/${encodeURIComponent(attachmentId)}`);
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`The image failed to load (${res.status})`);
  const body: unknown = await res.json();
  const { mime_type, base64 } = (body ?? {}) as {
    mime_type?: unknown;
    base64?: unknown;
  };
  if (
    typeof mime_type !== "string" ||
    !SHOWN_TYPES.has(mime_type) ||
    typeof base64 !== "string" ||
    !BASE64.test(base64)
  ) {
    throw new Error("The stored image can't be shown");
  }
  return { src: `data:${mime_type};base64,${base64}`, missing: false };
}

function loadImage(
  apiUrl: string,
  threadId: string,
  attachmentId: string,
): Promise<StoredImage> {
  const key = `${threadId}/${attachmentId}`;
  let pending = loaded.get(key);
  if (!pending) {
    pending = fetchImage(apiUrl, threadId, attachmentId).then(
      (image) => {
        if (image.src) settled.set(key, image);
        return image;
      },
      () => {
        loaded.delete(key);
        return { missing: false, failed: true };
      },
    );
    loaded.set(key, pending);
  }
  return pending;
}

/** A stored image in this thread, as a data URL for an img. */
export function useStoredImage(
  threadId: string,
  attachmentId: string,
): StoredImage {
  const { apiUrl } = useStreamContext();
  const key = `${threadId}/${attachmentId}`;
  const [result, setResult] = useState<{ key: string; image: StoredImage }>();

  useEffect(() => {
    if (!apiUrl || !threadId) return;
    let live = true;
    loadImage(apiUrl, threadId, attachmentId).then((image) => {
      if (live) setResult({ key, image });
    });
    return () => {
      live = false;
    };
  }, [apiUrl, threadId, attachmentId, key]);

  if (result?.key === key) return result.image;
  return settled.get(key) ?? { missing: false };
}
