/**
 * The next drop-in office hours, read from the support site's public events
 * API. That API has no working event-type filter for its export, so this
 * searches "office hours" and keeps only events typed as Office Hours.
 */

export type OfficeHour = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  url: string;
};

const OFFICE_HOURS_TYPE = "Office Hours";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** An event's own page, or the support site's page for it. */
function eventUrl(value: unknown, id: string, supportUrl: string): string {
  if (typeof value === "string") {
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || url.protocol === "http:") {
        return url.toString();
      }
    } catch {
      // Fall through to the support site's page.
    }
  }
  return `${supportUrl}/events/${encodeURIComponent(id)}`;
}

/** The next `limit` office hours that haven't ended, soonest first. */
export function parseOfficeHours(
  rows: unknown,
  {
    now,
    supportUrl,
    limit = 2,
  }: { now: Date; supportUrl: string; limit?: number },
): OfficeHour[] {
  if (!Array.isArray(rows)) return [];
  const hours: OfficeHour[] = [];
  for (const row of rows) {
    if (!isRecord(row) || row.event_type !== OFFICE_HOURS_TYPE) continue;
    const id = row.id == null ? "" : String(row.id);
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const start = parseDate(row.start_date);
    const end = parseDate(row.end_date) ?? start;
    if (!id || !title || !start || !end || end <= now) continue;
    hours.push({
      id,
      title,
      start,
      end,
      url: eventUrl(row.url, id, supportUrl),
    });
  }
  return hours
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, limit);
}

export async function fetchOfficeHours({
  supportUrl,
  now = new Date(),
  signal,
  fetchImpl = fetch,
}: {
  supportUrl: string;
  now?: Date;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<OfficeHour[]> {
  const url = new URL("/api/2.4/events", supportUrl);
  url.searchParams.set("beginning_date_relative", "today");
  url.searchParams.set("search_api_fulltext", "office hours");
  url.searchParams.set("items_per_page", "20");
  const response = await fetchImpl(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Events API returned ${response.status}`);
  return parseOfficeHours(await response.json(), { now, supportUrl });
}

/** "Tue, Nov 10, 9:30 AM EST" in the reader's own time zone. */
export function formatOfficeHourStart(start: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(start);
}
