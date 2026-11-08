import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfficeHours } from "./office-hours";

const SUPPORT = "https://support.access-ci.org";
const DESCRIPTION = "Drop in to talk with ACCESS staff.";
const hours = [
  {
    id: "9059",
    title: "ACCESS and NAIRR Pilot Office Hours",
    start: new Date("2026-11-10T20:00:00Z"),
    end: new Date("2026-11-10T21:00:00Z"),
    url: "https://support.access-ci.org/events/9059",
  },
  {
    id: "9238",
    title: "ACCESS and NAIRR Pilot Office Hours",
    start: new Date("2026-11-25T17:00:00Z"),
    end: new Date("2026-11-25T18:00:00Z"),
    url: "https://support.access-ci.org/events/9238",
  },
];

describe("OfficeHours", () => {
  it("links each session's start time to its event page in a new tab", () => {
    render(
      <OfficeHours
        hours={hours}
        description={DESCRIPTION}
        supportUrl={SUPPORT}
      />,
    );

    expect(screen.getByRole("region", { name: "Office hours" })).toBeTruthy();
    expect(screen.getByText(DESCRIPTION)).toBeTruthy();
    expect(
      screen.queryByText("ACCESS and NAIRR Pilot Office Hours"),
    ).toBeNull();
    const times = document.querySelectorAll("time");
    expect(times).toHaveLength(2);
    expect(times[0].getAttribute("dateTime")).toBe("2026-11-10T20:00:00.000Z");
    const link = times[0].closest("a");
    expect(link?.getAttribute("href")).toBe(hours[0].url);
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(
      screen
        .getByRole("link", { name: "All upcoming events" })
        .getAttribute("href"),
    ).toBe(`${SUPPORT}/events`);
  });

  it("shows nothing while loading, after a failure, or with no sessions", () => {
    const { container, rerender } = render(
      <OfficeHours
        hours={null}
        description={DESCRIPTION}
        supportUrl={SUPPORT}
      />,
    );
    expect(container.innerHTML).toBe("");
    rerender(
      <OfficeHours
        hours={[]}
        description={DESCRIPTION}
        supportUrl={SUPPORT}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
