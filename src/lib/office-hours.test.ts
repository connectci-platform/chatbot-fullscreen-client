import { describe, expect, it, vi } from "vitest";
import {
  fetchOfficeHours,
  formatOfficeHourStart,
  parseOfficeHours,
} from "./office-hours";

const SUPPORT = "https://support.access-ci.org";
const NOW = new Date("2026-11-10T15:00:00Z");
const AFFILIATION = "access_nairr_office_hours";
const OPTS = { now: NOW, supportUrl: SUPPORT, affiliation: AFFILIATION };

function row(overrides: Record<string, unknown>) {
  return {
    id: "1",
    title: "Jetstream2 Office Hours",
    event_type: "Office Hours",
    affiliation: "access_nairr_office_hours, ACCESS Collaboration, nairr_pilot",
    start_date: "2026-11-10T19:00:00Z",
    end_date: "2026-11-10T20:00:00Z",
    url: "https://support.access-ci.org/events/1",
    ...overrides,
  };
}

describe("parseOfficeHours", () => {
  it("keeps the next two office hours, soonest first", () => {
    const rows = [
      row({
        id: "3",
        title: "Later",
        start_date: "2026-11-12T19:00:00Z",
        end_date: "2026-11-12T20:00:00Z",
      }),
      row({ id: "1", title: "Soonest" }),
      row({
        id: "2",
        title: "Middle",
        start_date: "2026-11-11T19:00:00Z",
        end_date: "2026-11-11T20:00:00Z",
      }),
    ];

    const hours = parseOfficeHours(rows, OPTS);

    expect(hours.map((h) => h.title)).toEqual(["Soonest", "Middle"]);
    expect(hours[0].start.toISOString()).toBe("2026-11-10T19:00:00.000Z");
  });

  it("drops events that aren't office hours, that have ended, or are malformed", () => {
    const rows = [
      row({ id: "a", event_type: "Training" }),
      row({
        id: "b",
        start_date: "2026-11-10T13:00:00Z",
        end_date: "2026-11-10T14:00:00Z",
      }),
      row({ id: "c", start_date: "not a date" }),
      row({ id: "d", title: "  " }),
      null,
      "junk",
      row({
        id: "e",
        title: "Kept",
        start_date: "2026-11-10T14:30:00Z",
        end_date: "2026-11-10T15:30:00Z",
      }),
    ];

    const hours = parseOfficeHours(rows, OPTS);

    expect(hours.map((h) => h.id)).toEqual(["e"]);
  });

  it("keeps only the program's own sessions, not other providers'", () => {
    const rows = [
      row({ id: "ospool", affiliation: "ACCESS Collaboration" }),
      row({ id: "jetstream", affiliation: "Community, nairr_pilot" }),
      row({ id: "none", affiliation: null }),
      row({ id: "prefix", affiliation: "access_nairr_office_hours_old" }),
      row({ id: "access" }),
    ];

    expect(parseOfficeHours(rows, OPTS).map((h) => h.id)).toEqual(["access"]);
  });

  it("links to the support site's event page when the url isn't a web link", () => {
    const hours = parseOfficeHours(
      [
        row({ id: "42", url: "javascript:alert(1)" }),
        row({ id: "43", url: null }),
      ],
      OPTS,
    );

    expect(hours.map((h) => h.url)).toEqual([
      "https://support.access-ci.org/events/42",
      "https://support.access-ci.org/events/43",
    ]);
  });

  it("returns nothing for a response that isn't a list", () => {
    expect(parseOfficeHours({ error: "x" }, OPTS)).toEqual([]);
  });
});

describe("fetchOfficeHours", () => {
  it("searches upcoming office hours on the support site", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify([row({})]), { status: 200 }),
    );

    const hours = await fetchOfficeHours({
      supportUrl: SUPPORT,
      affiliation: AFFILIATION,
      now: NOW,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe(`${SUPPORT}/api/2.4/events`);
    expect(url.searchParams.get("search_api_fulltext")).toBe("office hours");
    expect(url.searchParams.get("beginning_date_relative")).toBe("today");
    expect(url.searchParams.get("items_per_page")).toBe("50");
    expect(hours).toHaveLength(1);
  });

  it("fails on an error response so the box can stay hidden", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }));

    await expect(
      fetchOfficeHours({
        supportUrl: SUPPORT,
        affiliation: AFFILIATION,
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toThrow("503");
  });
});

describe("formatOfficeHourStart", () => {
  it("shows the day, date, time and time zone", () => {
    expect(
      formatOfficeHourStart(
        new Date("2026-11-10T19:00:00Z"),
        "America/New_York",
      ),
    ).toBe("Tue, Nov 10, 2:00 PM EST");
  });
});
