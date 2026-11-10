import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  itemLabels,
  latestAnswerHasXdmodItem,
  tableCaptionLines,
  latestXdmodItems,
  tableCsv,
  tableFileName,
  tableViewsByMessage,
  xdmodItemsByMessage,
  type TableView,
} from "./xdmod-table";

type Json = Record<string, unknown>;

function tablePayload(over: Json = {}): Json {
  return {
    version: 1,
    source: "XDMoD",
    realm: "Jobs",
    metric: "total_cpu_hours",
    dimension: "person",
    dataset_type: "aggregate",
    aggregation_unit: "Auto",
    requested: { start: "2025-01-01", end: "2025-12-31" },
    filters: {},
    columns: [
      { name: "User", kind: "label" },
      { name: "CPU Hours: Total", kind: "number" },
    ],
    rows: [
      ["Doe, Jane - State U", 120.5],
      ["Roe, Rick - Tech", 30],
    ],
    row_count: 2,
    retrieved: "2026-11-10T12:00:00+00:00",
    ...over,
  };
}

function rawTurn(p: unknown, key = "raw-1", tool = "get_raw_data"): Message[] {
  return [
    { id: `h-${key}`, type: "human", content: "q" },
    {
      id: `pre-${key}`,
      type: "ai",
      content: "",
      tool_calls: [{ id: key, name: tool, args: {} }],
    },
    {
      id: `tool-${key}`,
      type: "tool",
      name: tool,
      tool_call_id: key,
      content: "summary",
      artifact: { structured_content: { table: p } },
    },
    { id: `ai-${key}`, type: "ai", content: "Here it is." },
  ] as unknown as Message[];
}

const only = (messages: Message[]): TableView => {
  const views = [...tableViewsByMessage(messages).values()].flat();
  expect(views).toHaveLength(1);
  return views[0];
};

describe("tableViewsByMessage", () => {
  it("reads a get_raw_data table under the turn's answer", () => {
    const views = tableViewsByMessage(rawTurn(tablePayload()));
    const [view] = views.get("ai-raw-1") ?? [];
    expect(view.kind).toBe("table");
    expect(view.key).toBe("raw-1");
    expect(view.title).toBe("CPU Hours: Total by User");
    expect(view.rows).toHaveLength(2);
    expect(view.columns.map((c) => c.name)).toEqual([
      "User",
      "CPU Hours: Total",
    ]);
  });

  it("titles an ungrouped table by its measure", () => {
    const view = only(
      rawTurn(
        tablePayload({
          dimension: null,
          dataset_type: "timeseries",
          columns: [
            { name: "Period", kind: "period" },
            { name: "CPU Hours: Total", kind: "number" },
          ],
          rows: [["2025-01-01", 4]],
          row_count: 1,
        }),
      ),
    );
    expect(view.title).toBe("CPU Hours: Total");
  });

  it.each([
    ["a newer version", { version: 2 }],
    ["a row of the wrong length", { rows: [["only one cell"]], row_count: 1 }],
    ["text where a number goes", { rows: [["a", "12"]], row_count: 1 }],
    ["a number where a name goes", { rows: [[12, 1]], row_count: 1 }],
    ["a row count that disagrees", { row_count: 3 }],
    ["an unknown column kind", { columns: [{ name: "x", kind: "date" }] }],
    ["no rows", { rows: [], row_count: 0 }],
  ])("ignores %s", (_, over) => {
    expect(tableViewsByMessage(rawTurn(tablePayload(over))).size).toBe(0);
  });

  it("ignores a table on another tool", () => {
    const messages = rawTurn(tablePayload(), "x", "get_chart_data");
    expect(tableViewsByMessage(messages).size).toBe(0);
  });

  it("keeps missing values as null", () => {
    const view = only(
      rawTurn(tablePayload({ rows: [["a", null]], row_count: 1 })),
    );
    expect(view.rows).toEqual([["a", null]]);
  });

  it("gives back the same view for the same message", () => {
    const messages = rawTurn(tablePayload());
    expect(only(messages)).toBe(only(messages));
  });
});

describe("xdmodItemsByMessage", () => {
  const chart = {
    version: 1,
    realm: "Jobs",
    statistic: "total_cpu_hours",
    group_by: "resource",
    dataset_type: "aggregate",
    requested: { start: "2025-01-01", end: "2025-12-31" },
    counted: { start: "2025-01-01", end: "2025-12-31" },
    last_period_incomplete: false,
    measure: {
      label: "CPU Hours: Total",
      description: "d",
      kind: "total",
      missing: "zero",
    },
    dimension: { name: "resource", ordered: false },
    filters: { notes: [] },
    categories: [
      { name: "A", value: 1 },
      { name: "B", value: 2 },
    ],
    has_more: false,
    ranked_by: "value",
    source: "XDMoD",
    retrieved: "2026-11-10",
  };

  /** One answer that charted and fetched the table in parallel. */
  const both = (tableFirst: boolean) =>
    [
      { id: "h", type: "human", content: "q" },
      {
        id: "pre",
        type: "ai",
        content: "",
        tool_calls: tableFirst
          ? [
              { id: "raw", name: "get_raw_data", args: {} },
              { id: "chart", name: "get_chart_data", args: {} },
            ]
          : [
              { id: "chart", name: "get_chart_data", args: {} },
              { id: "raw", name: "get_raw_data", args: {} },
            ],
      },
      {
        id: "t-chart",
        type: "tool",
        name: "get_chart_data",
        tool_call_id: "chart",
        content: "",
        artifact: { structured_content: { chart } },
      },
      {
        id: "t-raw",
        type: "tool",
        name: "get_raw_data",
        tool_call_id: "raw",
        content: "",
        artifact: { structured_content: { table: tablePayload() } },
      },
      { id: "answer", type: "ai", content: "a" },
    ] as unknown as Message[];

  it("holds an answer's charts and tables in tool-call order", () => {
    expect(
      xdmodItemsByMessage(both(false))
        .get("answer")
        ?.map((v) => v.kind),
    ).toEqual(["bar-ranked", "table"]);
    expect(
      xdmodItemsByMessage(both(true))
        .get("answer")
        ?.map((v) => v.kind),
    ).toEqual(["table", "bar-ranked"]);
  });

  it("finds the newest answer's table", () => {
    const messages = [
      ...rawTurn(tablePayload(), "old"),
      ...rawTurn(tablePayload(), "new"),
    ];
    expect(latestXdmodItems(messages).map((v) => v.key)).toEqual(["new"]);
    expect(latestAnswerHasXdmodItem(messages)).toBe(true);
    expect(
      latestAnswerHasXdmodItem([
        ...messages,
        { id: "h2", type: "human", content: "thanks" } as Message,
        { id: "a2", type: "ai", content: "welcome" } as Message,
      ]),
    ).toBe(false);
  });
});

describe("tableCsv", () => {
  it("has a header row, then every row", () => {
    const view = only(rawTurn(tablePayload()));
    expect(tableCsv(view)).toBe(
      'User,CPU Hours: Total\n"Doe, Jane - State U",120.5\n"Roe, Rick - Tech",30',
    );
  });

  it("quotes commas, quotes and line breaks", () => {
    const view = only(
      rawTurn(
        tablePayload({
          rows: [
            ['Say "hi"', 1],
            ["two\nlines", 2],
            ["cr\rhere", 3],
          ],
          row_count: 3,
        }),
      ),
    );
    expect(tableCsv(view).split("\n").slice(1, 2)).toEqual(['"Say ""hi""",1']);
    expect(tableCsv(view)).toContain('"two\nlines",2');
    expect(tableCsv(view)).toContain('"cr\rhere",3');
  });

  it.each(["=SUM(A1)", "+1", "-2", "@cmd", "\tx"])(
    "keeps %j from running as a formula",
    (name) => {
      const view = only(
        rawTurn(tablePayload({ rows: [[name, 1]], row_count: 1 })),
      );
      const cell = tableCsv(view).split("\n")[1].replace(/,1$/, "");
      expect(cell.replace(/^"|"$/g, "").startsWith(`'${name[0]}`)).toBe(true);
    },
  );

  it("escapes a formula in a column name too", () => {
    const view = only(
      rawTurn(
        tablePayload({
          columns: [
            { name: "=User", kind: "label" },
            { name: "CPU, Hours", kind: "number" },
          ],
        }),
      ),
    );
    expect(tableCsv(view).split("\n")[0]).toBe(`'=User,"CPU, Hours"`);
  });

  it("writes negative numbers as numbers and missing values as empty cells", () => {
    const view = only(
      rawTurn(
        tablePayload({
          rows: [
            ["a", -5],
            ["b", null],
          ],
          row_count: 2,
        }),
      ),
    );
    expect(tableCsv(view).split("\n").slice(1)).toEqual(["a,-5", "b,"]);
  });

  it("writes all 50,000 rows", () => {
    const rows = Array.from({ length: 50_000 }, (_, i) => [`user ${i}`, i]);
    const view = only(rawTurn(tablePayload({ rows, row_count: rows.length })));
    const lines = tableCsv(view).split("\n");
    expect(lines).toHaveLength(50_001);
    expect(lines.at(-1)).toBe("user 49999,49999");
  });
});

describe("tableFileName", () => {
  it("names the file by measure, grouping and range", () => {
    expect(tableFileName(only(rawTurn(tablePayload())))).toBe(
      "xdmod-cpu-hours-total-by-user-2025-01-01-to-2025-12-31",
    );
  });
});

describe("tableCaptionLines", () => {
  it("says what was counted, how many rows and where it came from", () => {
    expect(tableCaptionLines(only(rawTurn(tablePayload())))).toEqual([
      "Jan 1, 2025 to Dec 31, 2025",
      "2 rows, one per user. The CSV has every row.",
      "Source: XDMoD, retrieved Nov 10, 2026",
    ]);
  });

  it("names the filters and the period of a timeseries", () => {
    const view = only(
      rawTurn(
        tablePayload({
          dataset_type: "timeseries",
          aggregation_unit: "Month",
          dimension: "resource",
          filters: { resource: ["NCSA DELTA GPU", "NCSA DELTA CPU"] },
          columns: [
            { name: "Period", kind: "period" },
            { name: "Resource", kind: "label" },
            { name: "CPU Hours: Total", kind: "number" },
          ],
          rows: [["2025-01-01", "NCSA DELTA GPU", 1]],
          row_count: 1,
        }),
      ),
    );
    expect(tableCaptionLines(view).slice(0, 3)).toEqual([
      "Filtered to resource: NCSA DELTA GPU, NCSA DELTA CPU",
      "Jan 1, 2025 to Dec 31, 2025, by month",
      "1 row, one per month and resource. The CSV has every row.",
    ]);
  });
});

describe("itemLabels", () => {
  it("names a lone table by its title", () => {
    const view = only(rawTurn(tablePayload()));
    expect(itemLabels([view]).get(view.key)).toBe("CPU Hours: Total by User");
  });

  it("marks and numbers tables beside other items", () => {
    const a = only(rawTurn(tablePayload(), "a"));
    const b = only(rawTurn(tablePayload(), "b"));
    const labels = itemLabels([a, b]);
    expect(labels.get("a")).toBe("CPU Hours: Total by User · table 1");
    expect(labels.get("b")).toBe("CPU Hours: Total by User · table 2");
  });
});
