import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  cardConfirms,
  confirmBlock,
  pendingPreviews,
  previewDetails,
  previewTitle,
} from "./confirm";

const ID_A = "a".repeat(32);
const ID_B = "b".repeat(32);

const tool = (name: string, body: unknown): Message => ({
  id: `t-${name}`,
  type: "tool",
  name,
  tool_call_id: `c-${name}`,
  content: JSON.stringify(body),
});
const human: Message = { id: "h", type: "human", content: "hi" };

describe("pendingPreviews", () => {
  it("returns previews after the last human message, in order", () => {
    const messages = [
      tool("create_event", {
        status: "preview",
        executed: false,
        preview_id: ID_B,
        data: {},
      }),
      human,
      tool("create_event", {
        status: "preview",
        executed: false,
        preview_id: ID_A,
        data: { title: "X" },
      }),
      tool("delete_event", {
        status: "preview",
        executed: false,
        preview_id: ID_B,
      }),
    ];
    expect(pendingPreviews(messages)).toEqual([
      {
        previewId: ID_A,
        tool: "create_event",
        data: { title: "X" },
        noChanges: false,
      },
      { previewId: ID_B, tool: "delete_event", data: {}, noChanges: false },
    ]);
  });

  it("returns none once a human message follows", () => {
    const messages = [
      tool("create_event", {
        status: "preview",
        executed: false,
        preview_id: ID_A,
      }),
      human,
    ];
    expect(pendingPreviews(messages)).toEqual([]);
  });

  it("ignores content without a valid preview_id or preview status", () => {
    expect(
      pendingPreviews([
        tool("create_event", { status: "preview", executed: false, data: {} }),
        tool("create_event", {
          status: "preview",
          executed: false,
          preview_id: "nope",
        }),
        tool("create_event", { status: "created", preview_id: ID_A }),
      ]),
    ).toEqual([]);
  });
});

describe("pendingPreviews filtering", () => {
  it("ignores a tool that isn't a write tool", () => {
    expect(
      pendingPreviews([
        tool("search_events", {
          status: "preview",
          executed: false,
          preview_id: ID_A,
        }),
      ]),
    ).toEqual([]);
  });

  it("ignores a preview that executed or doesn't say it didn't", () => {
    expect(
      pendingPreviews([
        tool("create_event", {
          status: "preview",
          executed: true,
          preview_id: ID_A,
        }),
        tool("create_event", { status: "preview", preview_id: ID_B }),
      ]),
    ).toEqual([]);
  });
});

describe("no_changes", () => {
  it("is read from data and from the top level", () => {
    const got = pendingPreviews([
      tool("update_announcement", {
        status: "preview",
        executed: false,
        preview_id: ID_A,
        data: { no_changes: true },
      }),
      tool("update_event", {
        status: "preview",
        executed: false,
        preview_id: ID_B,
        no_changes: true,
      }),
    ]);
    expect(got.map((p) => p.noChanges)).toEqual([true, true]);
  });
});

describe("confirmBlock and titles", () => {
  it("builds the block", () => {
    expect(confirmBlock([ID_A])).toEqual({
      type: "confirm",
      preview_ids: [ID_A],
    });
  });

  it("titles known tools and humanizes unknown ones", () => {
    expect(previewTitle("delete_event")).toBe("Cancel this event series");
    expect(previewTitle("create_announcement")).toBe("Post this announcement");
    expect(previewTitle("do_new_thing")).toBe("Do new thing");
  });
});

describe("previewDetails", () => {
  it("lists changes as old to new, with unknown when old is unavailable", () => {
    const { rows } = previewDetails({
      changes: [
        { field: "title", old: "A", new: "B" },
        { field: "location", old_unavailable: true, new: "Online" },
      ],
    });
    expect(rows).toEqual([
      { label: "Title", value: "A → B" },
      { label: "Location", value: "unknown → Online" },
    ]);
  });

  it("turns flags into sentences and flattens one level", () => {
    const { notes, rows } = previewDetails({
      detail_unavailable: true,
      registrants_notified_on_commit: true,
      no_changes: false,
      event: { title: "Intro", seats: 4 },
      summary: "Hello",
    });
    expect(notes).toEqual([
      "Current details couldn't be loaded.",
      "Registrants will be emailed about this change.",
    ]);
    expect(rows).toEqual([
      { label: "Event title", value: "Intro" },
      { label: "Event seats", value: "4" },
      { label: "Summary", value: "Hello" },
    ]);
  });
});

describe("cardConfirms", () => {
  const preview = (previewId: string, noChanges = false) => ({
    previewId,
    tool: "register_for_event",
    data: {},
    noChanges,
  });

  it("is true only when the card's Confirm covers that preview", () => {
    expect(cardConfirms(ID_A, [preview(ID_A), preview(ID_B)])).toBe(true);
    expect(cardConfirms(ID_A, [preview(ID_B)])).toBe(false);
  });

  it("is false for a change with no preview id, which the card can't confirm", () => {
    expect(cardConfirms(undefined, [preview(ID_B)])).toBe(false);
  });

  it("is false for a preview the card shows only as a note", () => {
    expect(cardConfirms(ID_A, [preview(ID_A, true)])).toBe(false);
  });
});
