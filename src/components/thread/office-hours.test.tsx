import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfficeHours } from "./office-hours";

const SUPPORT = "https://support.access-ci.org";
const hours = [
  {
    id: "8948",
    title: "Jetstream2 Office Hours",
    start: new Date("2026-11-10T19:00:00Z"),
    end: new Date("2026-11-10T20:00:00Z"),
    url: "https://support.access-ci.org/events/8948",
  },
  {
    id: "9059",
    title: "ACCESS and NAIRR Pilot Office Hours",
    start: new Date("2026-11-10T20:00:00Z"),
    end: new Date("2026-11-10T21:00:00Z"),
    url: "https://support.access-ci.org/events/9059",
  },
];

describe("OfficeHours", () => {
  it("links each session to its event page in a new tab, with its start time", () => {
    render(
      <OfficeHours
        hours={hours}
        supportUrl={SUPPORT}
      />,
    );

    expect(screen.getByRole("region", { name: "Office hours" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Jetstream2 Office Hours" });
    expect(link.getAttribute("href")).toBe(hours[0].url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    const times = document.querySelectorAll("time");
    expect(times[0].getAttribute("dateTime")).toBe("2026-11-10T19:00:00.000Z");
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
        supportUrl={SUPPORT}
      />,
    );
    expect(container.innerHTML).toBe("");
    rerender(
      <OfficeHours
        hours={[]}
        supportUrl={SUPPORT}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
