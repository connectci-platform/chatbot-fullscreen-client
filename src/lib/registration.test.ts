import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  formatEventTime,
  latestRegistration,
  seatsText,
  type Registration,
} from "./registration";

const EVENT = {
  id: "9372",
  title: "Introduction to GPU Programming",
  start_date: "2026-11-20T18:00:00Z",
  end_date: "2026-11-20T20:00:00Z",
  location: "Online",
  url: "https://support.access-ci.org/events/9372",
};

function search(items: unknown[] = [EVENT]): Message {
  return {
    type: "tool",
    name: "search_events",
    tool_call_id: "s1",
    content: JSON.stringify({ total: items.length, items }),
  } as Message;
}

function call(id: string, eventId: unknown = "9372"): Message {
  return {
    type: "ai",
    content: "",
    tool_calls: [
      { id, name: "register_for_event", args: { eventinstance_id: eventId } },
    ],
  } as Message;
}

function result(id: string, body: unknown): Message {
  return {
    type: "tool",
    name: "register_for_event",
    tool_call_id: id,
    content: typeof body === "string" ? body : JSON.stringify(body),
  } as Message;
}

const preview = (outcome = "seat") => ({
  action: "register",
  status: "preview",
  executed: false,
  data: { outcome_if_confirmed: outcome },
});

describe("latestRegistration", () => {
  it("is empty for a conversation with no registration", () => {
    expect(latestRegistration([search()])).toBeNull();
  });

  it("shows a preview with the event found earlier in the conversation", () => {
    const view = latestRegistration([
      search(),
      call("c1"),
      result("c1", preview()),
    ]);

    expect(view?.status).toBe("preview");
    expect(view?.outcome).toBe("seat");
    expect(view?.event?.title).toBe("Introduction to GPU Programming");
    expect(view?.event?.location).toBe("Online");
  });

  it("reads a waitlist outcome", () => {
    const view = latestRegistration([
      call("c1"),
      result("c1", preview("waitlist")),
    ]);

    expect(view?.outcome).toBe("waitlist");
  });

  it("moves on to the newest step", () => {
    const view = latestRegistration([
      search(),
      call("c1"),
      result("c1", preview()),
      call("c2"),
      result("c2", { status: "registered", executed: true, data: {} }),
    ]);

    expect(view?.status).toBe("registered");
    expect(view?.key).toBe("c2");
  });

  it("ignores a refusal, keeping the step before it", () => {
    const view = latestRegistration([
      call("c1"),
      result("c1", preview()),
      call("c2"),
      result("c2", "Not done. Making this change needs the user to sign in."),
    ]);

    expect(view?.status).toBe("preview");
  });

  it("keeps a preview confirmable only while it's the last thing that happened", () => {
    const shown = [call("c1"), result("c1", preview())];
    const human = { type: "human", content: "no" } as Message;
    const failed = [call("c2"), result("c2", { status: "error" })];

    expect(latestRegistration(shown)?.actionable).toBe(true);
    expect(latestRegistration([...shown, human])?.actionable).toBe(false);
    expect(latestRegistration([...shown, ...failed])?.actionable).toBe(false);
  });

  it("gives each step its own key, so a repeat preview reopens the panel", () => {
    const first = latestRegistration([call("c1"), result("c1", preview())]);
    const again = latestRegistration([
      call("c1"),
      result("c1", preview()),
      call("c2"),
      result("c2", preview()),
    ]);

    expect(first?.key).not.toBe(again?.key);
  });

  it("shows nothing once the registration is cancelled", () => {
    const cancelled = {
      type: "tool",
      name: "cancel_registration",
      tool_call_id: "x1",
      content: JSON.stringify({ status: "cancelled", executed: true }),
    } as Message;

    expect(
      latestRegistration([
        call("c1"),
        result("c1", { status: "registered" }),
        cancelled,
      ]),
    ).toBeNull();
  });

  it("keeps the registration when a cancel didn't go through", () => {
    const failed = {
      type: "tool",
      name: "cancel_registration",
      tool_call_id: "x1",
      content: JSON.stringify({ status: "error" }),
    } as Message;

    expect(
      latestRegistration([
        call("c1"),
        result("c1", { status: "registered" }),
        failed,
      ])?.status,
    ).toBe("registered");
  });

  it("shows nothing when the only call was refused", () => {
    expect(
      latestRegistration([call("c1"), result("c1", "Not done.")]),
    ).toBeNull();
  });

  it("ignores a failed call", () => {
    expect(
      latestRegistration([call("c1"), result("c1", { status: "error" })]),
    ).toBeNull();
  });

  it("matches numeric ids", () => {
    const view = latestRegistration([
      search(),
      call("c1", 9372),
      result("c1", preview()),
    ]);

    expect(view?.event?.title).toBe("Introduction to GPU Programming");
  });

  it("uses details from get_event, which returns a single event", () => {
    const detail = {
      type: "tool",
      name: "get_event",
      tool_call_id: "g1",
      content: JSON.stringify(EVENT),
    } as Message;

    const view = latestRegistration([
      detail,
      call("c1"),
      result("c1", preview()),
    ]);

    expect(view?.event?.url).toBe(EVENT.url);
  });

  it("does not use another event's details", () => {
    const view = latestRegistration([
      search([{ ...EVENT, id: "1" }]),
      call("c1"),
      result("c1", preview()),
    ]);

    expect(view?.event).toBeNull();
  });

  it("copes with a search result that isn't JSON or has no title", () => {
    const broken = { ...search(), content: "oops" } as Message;
    const untitled = search([{ id: "9372" }]);

    const view = latestRegistration([
      broken,
      untitled,
      call("c1"),
      result("c1", preview()),
    ]);

    expect(view?.event).toBeNull();
  });

  it("copes with tool content that isn't text", () => {
    const blocks = { ...result("c1", preview()), content: [] } as Message;

    expect(latestRegistration([call("c1"), blocks])).toBeNull();
  });

  it("still shows a step when the call that made it is missing", () => {
    const view = latestRegistration([result("c1", preview())]);

    expect(view?.status).toBe("preview");
    expect(view?.event).toBeNull();
  });
});

describe("seats", () => {
  const withSeats = (seats: unknown, item: object = EVENT) =>
    latestRegistration([
      search([item]),
      call("c1"),
      result("c1", {
        status: "preview",
        data: { outcome_if_confirmed: "seat", seats_remaining: seats },
      }),
    ]) as Registration;

  it("reads seats left and the event's capacity", () => {
    const view = withSeats(39, {
      ...EVENT,
      access_registration: { enabled: true, capacity: 40 },
    });

    expect(view.seatsRemaining).toBe(39);
    expect(seatsText(view)).toBe("39 of 40 seats left");
  });

  it("works without a capacity", () => {
    expect(seatsText(withSeats(39))).toBe("39 seats left");
    expect(seatsText(withSeats(1))).toBe("1 seat left");
  });

  it("says nothing when the count isn't a number", () => {
    expect(seatsText(withSeats(undefined))).toBeNull();
    expect(seatsText(withSeats("39"))).toBeNull();
  });
});

describe("formatEventTime", () => {
  it("shows the date and time range without a weekday", () => {
    expect(
      formatEventTime(EVENT.start_date, EVENT.end_date, "America/New_York"),
    ).toBe("November 20, 2026, 1:00 PM – 3:00 PM EST");
  });

  it("shows a start with no end", () => {
    expect(
      formatEventTime(EVENT.start_date, undefined, "America/New_York"),
    ).toBe("November 20, 2026, 1:00 PM EST");
  });

  it("treats a bad end like no end", () => {
    expect(formatEventTime(EVENT.start_date, "nope", "America/New_York")).toBe(
      "November 20, 2026, 1:00 PM EST",
    );
  });

  it("is empty without a usable start", () => {
    expect(formatEventTime()).toBeNull();
    expect(formatEventTime("nope")).toBeNull();
  });
});
