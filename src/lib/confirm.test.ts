import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  cardConfirms,
  confirmBlock,
  htmlText,
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

  const staged = tool("create_event", {
    status: "preview",
    executed: false,
    preview_id: ID_A,
  });
  const ai: Message = { id: "a", type: "ai", content: "Click Confirm." };

  it("keeps the card through a typed reply, which can't confirm it", () => {
    const messages = [staged, ai, { ...human, content: "yes, post it" }, ai];
    expect(pendingPreviews(messages).map((p) => p.previewId)).toEqual([ID_A]);
  });

  it("ends once the card is clicked", () => {
    const click: Message = {
      id: "c",
      type: "human",
      content: [
        { type: "text", text: "Confirm" },
        { type: "confirm", preview_ids: [ID_A] },
      ] as unknown as Message["content"],
    };
    expect(pendingPreviews([staged, ai, click])).toEqual([]);
  });

  it("ends once the click comes back from the thread, ids out of band", () => {
    const stored: Message = {
      id: "c",
      type: "human",
      content: "Confirm",
      additional_kwargs: { confirm: [ID_A] },
    };
    expect(pendingPreviews([staged, ai, stored, ai])).toEqual([]);
  });

  it("ends on Cancel, clicked or typed", () => {
    for (const text of ["Cancel", " cancel. "]) {
      const cancel: Message = { ...human, content: text };
      expect(pendingPreviews([staged, ai, cancel, ai])).toEqual([]);
    }
  });

  it("lists a preview id once", () => {
    expect(pendingPreviews([staged, staged]).map((p) => p.previewId)).toEqual([
      ID_A,
    ]);
  });

  it("shows only the newest turn's previews", () => {
    const newer = tool("delete_event", {
      status: "preview",
      executed: false,
      preview_id: ID_B,
    });
    expect(
      pendingPreviews([staged, ai, human, newer]).map((p) => p.previewId),
    ).toEqual([ID_B]);
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

describe("dates_incomplete", () => {
  it("is a note, not a row", () => {
    const { notes, rows } = previewDetails({
      title: "Office Hours",
      dates_incomplete: true,
    });
    expect(notes).toEqual(["Not all of this series' dates could be loaded."]);
    expect(rows).toEqual([{ label: "Title", value: "Office Hours" }]);
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

describe("htmlText", () => {
  it("shows a body's paragraphs as text", () => {
    expect(htmlText("<p>One &amp; two.</p><p>Three<br>four</p>")).toBe(
      "One & two.\n\nThree\nfour",
    );
  });

  it("keeps a link's target and an image's source in view", () => {
    expect(
      htmlText('<p>See <a href="https://evil.example/x">the docs</a></p>'),
    ).toBe("See the docs (https://evil.example/x)");
    expect(htmlText("<img src='/a.png' alt='x'>")).toBe("[image: /a.png]");
  });

  it("lists items one per line", () => {
    expect(htmlText("<ul><li>A</li><li>B</li></ul>")).toBe("• A\n• B");
  });

  it("leaves plain text alone", () => {
    expect(htmlText("2 < 3 and 5 > 4")).toBe("2 < 3 and 5 > 4");
  });

  it("is used for body and description rows, and only those", () => {
    expect(
      previewDetails({
        body: "<p>Hi</p>",
        description: "<b>Bold</b>",
        title: "Use <b> tags",
      }).rows,
    ).toEqual([
      { label: "Body", value: "Hi" },
      { label: "Description", value: "Bold" },
      { label: "Title", value: "Use <b> tags" },
    ]);
  });

  it("is used for a body change", () => {
    expect(
      previewDetails({
        changes: [{ field: "body", old: "<p>A</p>", new: "<p>B</p>" }],
      }).rows,
    ).toEqual([{ label: "Body", value: "A → B" }]);
  });
});

describe("htmlText doesn't hide where a link goes", () => {
  const evil = "https://evil.example";

  it.each([
    ["an unquoted href", `<a href=${evil}>the docs</a>`],
    ["a slash before href", `<a/href="${evil}">the docs</a>`],
    ["an unclosed link", `<a href="${evil}">the docs`],
    [
      "a quoted > in another attribute",
      `<a title="a>b" href="${evil}">the docs</a>`,
    ],
  ])("with %s", (_, html) => {
    expect(htmlText(html)).toBe(`the docs (${evil})`);
  });

  it("reads href from the link's own tag, not from text inside it", () => {
    expect(
      htmlText(
        `<a href=${evil}><span title=' href="https://access-ci.org"'>the docs</span></a>`,
      ),
    ).toBe(`the docs (${evil})`);
  });

  it("uses the first href, as a browser does", () => {
    expect(
      htmlText(`<a href="${evil}" href="https://access-ci.org">x</a>`),
    ).toBe(`x (${evil})`);
  });

  it("shows an entity-encoded target decoded", () => {
    expect(htmlText('<a href="java&#115;cript:alert(1)">x</a>')).toBe(
      "x (javascript:alert(1))",
    );
  });

  it("shows what other tags load", () => {
    expect(htmlText(`<img src=${evil}/t.png>`)).toBe(`[image: ${evil}/t.png]`);
    expect(htmlText(`<iframe src="${evil}"></iframe>`)).toBe(
      `[iframe: ${evil}]`,
    );
    expect(htmlText(`<form action="${evil}"><button>Go</button></form>`)).toBe(
      `[form: ${evil}]Go`,
    );
  });

  it("decodes entities once", () => {
    expect(htmlText("<p>&amp;lt;b&amp;gt; &#60; &#x3e;</p>")).toBe(
      "&lt;b&gt; < >",
    );
  });

  it("drops comments, which a reader doesn't see", () => {
    expect(htmlText("<p>A<!-- <a href='x'> -->B</p>")).toBe("AB");
  });
});

describe("dates on the card", () => {
  it("shows the local time in place of the UTC one", () => {
    expect(
      previewDetails({
        title: "Office hours",
        start_date: "2026-11-19T19:00:00Z",
        start_local: "Thu, Nov 19, 2026, 1:00 PM CST",
        end_date: "2026-11-19T20:00:00Z",
      }).rows,
    ).toEqual([
      { label: "Title", value: "Office hours" },
      { label: "Start", value: "Thu, Nov 19, 2026, 1:00 PM CST" },
      { label: "End date", value: "2026-11-19T20:00:00Z" },
    ]);
  });
});
