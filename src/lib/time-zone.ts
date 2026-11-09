/**
 * The reader's IANA time zone, such as "America/New_York", sent with each
 * question so the agent can give event times in it. Undefined if the browser
 * won't say, and the agent then labels times UTC.
 */
export function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
