const GENERIC = "Something went wrong. Please try again.";

// Names the SDK reports when the user stopped the run on purpose.
const SILENT = new Set(["cancelled", "AbortError"]);

/** Plain text for a failed run, or null when nothing should be shown. */
export function runErrorMessage(error: unknown): string | null {
  const name = error instanceof Error ? error.name : "";
  if (SILENT.has(name)) return null;
  if (name === "timeout") return "That took too long. Please try again.";
  return GENERIC;
}
