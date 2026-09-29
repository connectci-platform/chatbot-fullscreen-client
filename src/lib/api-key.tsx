// Retained for the (now form-less) apiKey plumbing still threaded through
// Stream.tsx / Thread.tsx's Client construction — see
// .phase2-slice-reskin-report.md for what's left of this to clean up.
const API_KEY_STORAGE_KEY = "lg:chat:apiKey";
const API_KEY_HOST_STORAGE_KEY = "lg:chat:apiKeyHost";

function originOf(apiUrl: string): string | null {
  try {
    return new URL(apiUrl).origin;
  } catch {
    return null;
  }
}

export function getApiKey(apiUrl: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    const storedHost = window.localStorage.getItem(API_KEY_HOST_STORAGE_KEY);
    const currentHost = originOf(apiUrl);
    if (!storedHost || !currentHost || storedHost !== currentHost) {
      return null;
    }
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) ?? null;
  } catch {
    // no-op
  }

  return null;
}
