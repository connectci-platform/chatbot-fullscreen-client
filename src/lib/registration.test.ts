import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { formatEventTime, latestRegistration } from "./registration";

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
    expect(view?.key).toBe("9372:registered");
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
