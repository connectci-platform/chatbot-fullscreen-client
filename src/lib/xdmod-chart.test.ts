import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import {
  chartLabels,
  chartViewsByMessage,
  latestAnswerHasChart,
  latestChartViews,
} from "./xdmod-chart";

type Json = Record<string, unknown>;

function payload(over: Json = {}): Json {
  return {
    version: 1,
    realm: "Jobs",
    statistic: "total_cpu_hours",
    group_by: "none",
    dataset_type: "timeseries",
    unit: "Month",
    requested: { start: "2026-01-01", end: "2026-03-31" },
    counted: { start: "2026-01-01", end: "2026-03-31" },
    last_period_incomplete: false,
    measure: {
      label: "CPU Hours: Total",
      description: "Total CPU hours.",
      kind: "total",
      missing: "zero",
    },
    dimension: { name: "none", ordered: false },
    filters: { notes: [] },
    series: [
      {
        name: "All",
        points: [
          { start: "2026-01-01", value: 10 },
          { start: "2026-02-01", value: null },
          { start: "2026-03-01", value: 30 },
        ],
      },
    ],
    has_more: false,
    ranked_by: "value",
    link: "https://xdmod.access-ci.org/#chart",
    source: "XDMoD",
    retrieved: "2026-11-09",
    ...over,
  };
}

function aggregate(over: Json = {}): Json {
  return payload({
    dataset_type: "aggregate",
    unit: undefined,
    series: undefined,
    group_by: "resource",
    dimension: { name: "resource", ordered: false },
    categories: [
      { name: "A", value: 5 },
      { name: "B", value: null },
      { name: "C", value: 50 },
    ],
    ...over,
  });
}

const human = (id: string): Message =>
  ({ id, type: "human", content: "q" }) as Message;
const ai = (id: string): Message =>
  ({ id, type: "ai", content: "answer" }) as Message;
function tool(id: string, artifact: unknown, name = "get_chart_data"): Message {
  return {
    id: `m-${id}`,
    type: "tool",
    name,
    tool_call_id: id,
    content: "text",
    artifact,
  } as unknown as Message;
}
const chart = (p: Json) => ({ structured_content: { chart: p } });

function turn(p: Json, id = "t1"): Message[] {
  return [human("h"), ai("a0"), tool(id, chart(p)), ai("a1")];
}
function view(p: Json) {
  return latestChartViews(turn(p))[0] ?? null;
}

describe("chartViewsByMessage", () => {
  it("builds a line view keyed by tool call and the turn's final AI message", () => {
    const views = chartViewsByMessage(turn(payload()));
    expect([...views.keys()]).toEqual(["a1"]);
    const v = views.get("a1")![0];
    expect(v.key).toBe("t1");
    expect(v.messageId).toBe("a1");
    expect(v.kind).toBe("line");
    expect(v.title).toBe("CPU Hours: Total");
    expect(v.link).toBe("https://xdmod.access-ci.org/#chart");
    expect(v.caption).toMatchObject({
      measure: "CPU Hours: Total",
      definition: "Total CPU hours.",
      counted: { start: "2026-01-01", end: "2026-03-31" },
      unit: "Month",
      filters: [],
      hasMore: false,
      incomplete: false,
      source: "XDMoD",
      retrieved: "2026-11-09",
    });
  });

  it("turns null into 0 when missing is zero and keeps it when gap", () => {
    expect(view(payload())!.series[0].points.map((p) => p.value)).toEqual([
      10, 0, 30,
    ]);
    const gap = view(
      payload({
        measure: {
          label: "x",
          description: "",
          kind: "average",
          missing: "gap",
        },
        statistic: "avg_x",
      }),
    )!;
    expect(gap.series[0].points.map((p) => p.value)).toEqual([10, null, 30]);
  });

  it("sorts ranked bars by value descending with nulls last", () => {
    const v = view(aggregate())!;
    expect(v.kind).toBe("bar-ranked");
    expect(v.bars.map((b) => b.name)).toEqual(["C", "A", "B"]);
  });

  it("keeps payload order for ordered dimensions", () => {
    const v = view(
      aggregate({
        group_by: "jobsize",
        dimension: { name: "jobsize", ordered: true },
      }),
    )!;
    expect(v.kind).toBe("bar-ordered");
    expect(v.bars.map((b) => b.name)).toEqual(["A", "B", "C"]);
    expect(v.bars[1].value).toBe(0);
  });

  it("opens nothing for one category or one non-null point", () => {
    expect(
      view(aggregate({ categories: [{ name: "A", value: 1 }] })),
    ).toBeNull();
    expect(
      view(
        payload({
          series: [
            {
              name: "s",
              points: [
                { start: "2026-01-01", value: 1 },
                { start: "2026-02-01", value: null },
              ],
            },
            { name: "t", points: [{ start: "2026-01-01", value: null }] },
          ],
          measure: {
            label: "x",
            description: "",
            kind: "average",
            missing: "gap",
          },
        }),
      ),
    ).toBeNull();
  });

  it("opens nothing for other tools, bad versions, malformed or absent artifacts", () => {
    const cases: Message[][] = [
      [human("h"), tool("t", chart(payload()), "other_tool"), ai("a")],
      turn(payload({ version: 2 })),
      turn(payload({ series: "nope" })),
      turn(payload({ measure: null })),
      [human("h"), tool("t", undefined), ai("a")],
      [human("h"), tool("t", "str"), ai("a")],
      [human("h"), tool("t", { structured_content: null }), ai("a")],
    ];
    for (const messages of cases) {
      expect(chartViewsByMessage(messages).size).toBe(0);
    }
  });

  it("opens nothing for refusal or timeout artifacts", () => {
    for (const artifact of [
      { refusal: { reason: "no" } },
      { timed_out: true },
    ]) {
      expect(
        chartViewsByMessage([human("h"), tool("t", artifact), ai("a")]).size,
      ).toBe(0);
    }
  });

  it("keeps every chart in a turn, in tool-call order", () => {
    const call = (...ids: string[]) =>
      ({
        id: "a0",
        type: "ai",
        content: "",
        tool_calls: ids.map((id) => ({ id, name: "get_chart_data", args: {} })),
      }) as unknown as Message;
    const messages = [
      human("h1"),
      call("wait", "jobs"),
      // Parallel calls can finish in either order.
      tool("jobs", chart(payload({ statistic: "job_count" }))),
      tool("wait", chart(payload({ statistic: "avg_waitduration_hours" }))),
      ai("a1"),
      human("h2"),
      tool("t3", chart(aggregate())),
      ai("a2"),
    ];
    const views = chartViewsByMessage(messages);
    expect(views.size).toBe(2);
    expect(views.get("a1")!.map((v) => v.key)).toEqual(["wait", "jobs"]);
    expect(views.get("a2")!.map((v) => v.key)).toEqual(["t3"]);
    expect(latestChartViews(messages).map((v) => v.key)).toEqual(["t3"]);
    expect(latestChartViews(messages.slice(0, 5)).map((v) => v.key)).toEqual([
      "wait",
      "jobs",
    ]);
  });

  it("falls back to an earlier chart when a later call in the turn isn't chart-worthy", () => {
    const v = chartViewsByMessage([
      human("h"),
      tool("t1", chart(payload())),
      tool("t2", { timed_out: true }),
      ai("a"),
    ]);
    expect(v.get("a")!.map((x) => x.key)).toEqual(["t1"]);
  });

  it("keys a still-streaming turn by the last AI message so far", () => {
    const v = chartViewsByMessage([
      human("h"),
      ai("a0"),
      tool("t1", chart(payload())),
    ]);
    expect([...v.keys()]).toEqual(["a0"]);
  });

  it("names the dimension for the bar table", () => {
    expect(view(aggregate())!.dimension).toBe("Resource");
    expect(
      view(
        aggregate({
          group_by: "fieldofscience",
          dimension: { name: "fieldofscience", ordered: false },
        }),
      )!.dimension,
    ).toBe("Field of science");
    expect(
      view(
        aggregate({
          group_by: "jobsize",
          dimension: { name: "jobsize", ordered: true },
        }),
      )!.dimension,
    ).toBe("Job size");
    expect(
      view(
        aggregate({
          group_by: "gpu_count_bucket",
          dimension: { name: "gpu_count_bucket", ordered: false },
        }),
      )!.dimension,
    ).toBe("Gpu Count Bucket");
  });

  it("carries data_through when the payload has it", () => {
    expect(
      view(payload({ data_through: "2026-02-01" }))!.caption.dataThrough,
    ).toBe("2026-02-01");
    expect(view(payload({ data_through: null }))!.caption.dataThrough).toBe(
      undefined,
    );
    expect(view(payload())!.caption.dataThrough).toBe(undefined);
    expect(view(payload({ data_through: 7 }))).toBeNull();
  });

  it("marks the data_through period partial only when the flag says so", () => {
    const through = { data_through: "2026-02-01" };
    expect(view(payload(through))!.caption.partialPeriod).toBe(undefined);
    expect(
      view(payload({ ...through, last_data_period_partial: false }))!.caption
        .partialPeriod,
    ).toBe(undefined);
    expect(
      view(payload({ ...through, last_data_period_partial: true }))!.caption
        .partialPeriod,
    ).toBe("2026-02-01");
    expect(view(payload({ last_data_period_partial: "yes" }))).toBeNull();
  });

  describe("zero-filling around data_through", () => {
    const points = [
      { start: "2026-01-01", value: 10 },
      { start: "2026-02-01", value: null },
      { start: "2026-03-01", value: 30 },
      { start: "2026-04-01", value: null },
      { start: "2026-05-01", value: null },
    ];
    const values = (over: Json) =>
      view(
        payload({ series: [{ name: "All", points }], ...over }),
      )!.series[0].points.map((p) => p.value);

    it("ends the axis at the last period with any data", () => {
      // April and May hold nothing for any series, so they aren't drawn.
      expect(values({ data_through: "2026-03-01" })).toEqual([10, 0, 30]);
    });

    it("zero-fills a total only up to the series' own last value", () => {
      expect(values({})).toEqual([10, 0, 30]);
      expect(values({ data_through: null })).toEqual([10, 0, 30]);
    });

    it("stops a series that ends early at its own last value", () => {
      const v = view(
        payload({
          data_through: "2026-04-01",
          series: [
            { name: "Anvil", points },
            {
              name: "Delta",
              points: points.map((p) => ({
                ...p,
                value: p.start < "2026-05-01" ? 1 : null,
              })),
            },
          ],
        }),
      )!;
      // Delta reaches April, so the axis does; May has no data at all.
      expect(v.series[0].points.map((p) => p.value)).toEqual([10, 0, 30, null]);
      expect(v.series[1].points.map((p) => p.value)).toEqual([1, 1, 1, 1]);
    });

    it("drops a series with no values", () => {
      const empty = points.map((p) => ({ ...p, value: null }));
      const v = view(
        payload({
          series: [
            { name: "All", points },
            { name: "Empty", points: empty },
          ],
        }),
      )!;
      expect(v.series.map((s) => s.name)).toEqual(["All"]);
    });

    it("leaves an average's gaps alone", () => {
      const average = {
        label: "Wait",
        description: "Avg wait.",
        kind: "average",
        missing: "gap",
      };
      expect(values({ measure: average, data_through: "2026-03-01" })).toEqual([
        10,
        null,
        30,
      ]);
      expect(values({ measure: average })).toEqual([10, null, 30]);
    });
  });

  it("keeps a chart whose link is null, missing or not https, with no link", () => {
    const filtered = { filters: { notes: ["Resource is Delta"] } };
    expect(view(payload({ ...filtered, link: null }))!.link).toBeNull();
    expect(view(payload({ ...filtered, link: undefined }))!.link).toBeNull();
    expect(view(payload({ link: "javascript:alert(1)" }))!.link).toBeNull();
    expect(view(payload())!.link).toBe("https://xdmod.access-ci.org/#chart");
    expect(view(payload({ link: 5 }))).toBeNull();
  });

  it("returns null with no charts", () => {
    expect(latestChartViews([human("h"), ai("a")])).toEqual([]);
  });

  describe("chartLabels", () => {
    const wait = (over: Json) =>
      view(
        aggregate({
          statistic: "avg_waitduration_hours",
          measure: {
            label: "Wait Hours: Per Job",
            description: "Avg wait.",
            kind: "average",
            missing: "gap",
          },
          ...over,
        }),
      )!;

    it("names charts of the same measure by what differs", () => {
      const a = {
        ...wait({ filters: { notes: ['resource "Delta" included A, B'] } }),
        key: "a",
      };
      const b = {
        ...wait({ filters: { notes: ["resource Anvil"] } }),
        key: "b",
      };
      const c = { ...wait({}), key: "c" };
      expect([...chartLabels([a, b, c]).values()]).toEqual([
        "Wait Hours: Per Job · Delta",
        "Wait Hours: Per Job · Anvil",
        "Wait Hours: Per Job · all of ACCESS",
      ]);
    });

    it("uses the range or grouping when that is the difference", () => {
      const a = { ...wait({}), key: "a" };
      const b = {
        ...wait({
          group_by: "queue",
          dimension: { name: "queue", ordered: false },
          counted: { start: "2025-01-01", end: "2025-12-31" },
        }),
        key: "b",
      };
      expect(chartLabels([a, b]).get("b")).toBe(
        "Wait Hours: Per Job · by queue · Jan 1, 2025 to Dec 31, 2025",
      );
    });

    it("keeps a lone measure's title, and numbers identical charts", () => {
      const a = { ...wait({}), key: "a" };
      const other = { ...view(aggregate())!, key: "o" };
      expect(chartLabels([a, other]).get("a")).toBe("Wait Hours: Per Job");
      expect([...chartLabels([a, { ...a, key: "b" }]).values()]).toEqual([
        "Wait Hours: Per Job · chart 1",
        "Wait Hours: Per Job · chart 2",
      ]);
    });
  });

  describe("chartLabels edge cases", () => {
    const wait = (over: Json) =>
      view(
        payload({
          statistic: "avg_waitduration_hours",
          measure: {
            label: "Wait Hours: Per Job",
            description: "Avg wait.",
            kind: "average",
            missing: "gap",
          },
          ...over,
        }),
      )!;

    it("numbers charts that still share a name", () => {
      const delta = { filters: { notes: ["resource Delta"] } };
      const a = { ...wait(delta), key: "a" };
      const b = { ...wait(delta), key: "b" };
      const c = {
        ...wait({ filters: { notes: ["resource Anvil"] } }),
        key: "c",
      };
      expect([...chartLabels([a, b, c]).values()]).toEqual([
        "Wait Hours: Per Job · Delta · chart 1",
        "Wait Hours: Per Job · Delta · chart 2",
        "Wait Hours: Per Job · Anvil",
      ]);
    });

    it("doesn't call a group_by none chart 'by name'", () => {
      const total = { ...wait({}), key: "t" };
      const byResource = {
        ...wait({
          group_by: "resource",
          dimension: { name: "resource", ordered: false },
        }),
        key: "r",
      };
      const labels = chartLabels([total, byResource]);
      expect(labels.get("t")).toBe("Wait Hours: Per Job · total");
      expect(labels.get("r")).toBe("Wait Hours: Per Job · by resource");
    });

    it("keeps a name's own parentheses, dropping only the unchecked note", () => {
      const a = {
        ...wait({
          filters: { notes: ["institution Foo University (Main Campus)"] },
        }),
        key: "a",
      };
      const b = {
        ...wait({
          filters: {
            notes: [`institution "Bar U" (not checked against XDMoD's names)`],
          },
        }),
        key: "b",
      };
      expect([...chartLabels([a, b]).values()]).toEqual([
        "Wait Hours: Per Job · Foo University (Main Campus)",
        "Wait Hours: Per Job · Bar U",
      ]);
    });
  });

  describe("latestAnswerHasChart", () => {
    it("is true only when the newest answer drew a chart", () => {
      const charted = turn(payload());
      expect(latestAnswerHasChart(charted)).toBe(true);
      expect(latestAnswerHasChart([...charted, human("h2"), ai("a2")])).toBe(
        false,
      );
      expect(latestAnswerHasChart([])).toBe(false);
    });
  });

  describe("offset and early ends", () => {
    it("carries the offset and counts the skipped ones in the total", () => {
      const v = view(
        aggregate({ offset: 3, has_more: true, others_count: 71 }),
      )!;
      expect(v.caption).toMatchObject({ offset: 3, total: 77, hasMore: true });
    });

    it("leaves offset out at 0 and in older payloads", () => {
      expect(view(aggregate({ offset: 0 }))!.caption).not.toHaveProperty(
        "offset",
      );
      expect(view(aggregate())!.caption).not.toHaveProperty("offset");
      expect(view(aggregate())!.caption).not.toHaveProperty("earlyEnds");
      expect(view(aggregate({ offset: -1 }))).toBeNull();
      expect(view(aggregate({ offset: "3" }))).toBeNull();
    });

    it("lists drawn series that stop early, without leaking the field into the series", () => {
      const v = view(
        payload({
          group_by: "resource",
          dimension: { name: "resource", ordered: false },
          series: [
            {
              name: "A",
              points: [
                { start: "2026-01-01", value: 1 },
                { start: "2026-02-01", value: 2 },
              ],
            },
            {
              name: "B",
              points: [
                { start: "2026-01-01", value: 1 },
                { start: "2026-02-01", value: null },
              ],
              data_through: "2026-01-01",
              data_through_precision: "period",
              data_through_source: "resource",
            },
            {
              name: "C",
              points: [
                { start: "2026-01-01", value: 1 },
                { start: "2026-02-01", value: 1 },
              ],
              data_through: "2026-02-10",
            },
          ],
        }),
      )!;
      // Without a source, C is said only as weakly as possible.
      expect(v.caption.earlyEnds).toEqual([
        {
          name: "B",
          through: "2026-01-01",
          precision: "period",
          source: "resource",
        },
        {
          name: "C",
          through: "2026-02-10",
          precision: "day",
          source: "series",
        },
      ]);
      expect(v.series[1]).toEqual({
        name: "B",
        points: [
          { start: "2026-01-01", value: 1 },
          { start: "2026-02-01", value: null },
        ],
      });
    });

    it("lists bars whose data stops early", () => {
      const v = view(
        aggregate({
          categories: [
            { name: "A", value: 5 },
            {
              name: "B",
              value: 4,
              data_through: "2026-10-19",
              data_through_source: "resource",
            },
          ],
        }),
      )!;
      expect(v.caption.earlyEnds).toEqual([
        {
          name: "B",
          through: "2026-10-19",
          precision: "day",
          source: "resource",
        },
      ]);
    });

    it("rejects a malformed early end", () => {
      expect(
        view(
          aggregate({
            categories: [
              { name: "A", value: 1, data_through: 5 },
              { name: "B", value: 2 },
            ],
          }),
        ),
      ).toBeNull();
      const bad = payload();
      (bad.series as Json[])[0].data_through_precision = "week";
      expect(view(bad)).toBeNull();
      const badSource = payload();
      (badSource.series as Json[])[0].data_through_source = "guess";
      expect(view(badSource)).toBeNull();
    });
  });

  describe("warnings", () => {
    it("flags waiting jobs not counted for an incomplete Jobs period", () => {
      expect(
        view(payload({ last_period_incomplete: true }))!.caption,
      ).toMatchObject({
        incomplete: true,
        warnings: expect.arrayContaining(["waiting-not-counted"]),
      });
      expect(
        view(payload({ last_period_incomplete: true, realm: "Allocations" }))!
          .caption.warnings,
      ).not.toContain("waiting-not-counted");
      expect(view(payload())!.caption.warnings).toEqual([]);
    });

    it("flags CPU hours across resources, but not SUs or ACEs, which XDMoD normalizes", () => {
      expect(view(aggregate())!.caption.warnings).toContain(
        "not-comparable-across-resources",
      );
      expect(
        view(aggregate({ statistic: "avg_cpu_hours" }))!.caption.warnings,
      ).toContain("not-comparable-across-resources");
      for (const statistic of ["total_su", "total_ace", "avg_su"]) {
        expect(view(aggregate({ statistic }))!.caption.warnings).not.toContain(
          "not-comparable-across-resources",
        );
      }
      expect(
        view(aggregate({ statistic: "job_count" }))!.caption.warnings,
      ).not.toContain("not-comparable-across-resources");
    });

    it("flags means of jobs for avg_ statistics", () => {
      expect(
        view(payload({ statistic: "avg_cpu_hours" }))!.caption.warnings,
      ).toContain("mean-of-jobs");
    });
  });
});

describe("data_through precision", () => {
  const months = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      start: `2026-0${i + 1}-01`,
      value: i < 2 ? 5 : null,
    }));
  const caption = (over: Json) =>
    view(payload({ series: [{ name: "All", points: months(3) }], ...over }))!
      .caption;

  it("takes the payload's precision, and says when later periods are empty", () => {
    const c = caption({
      data_through: "2026-02-01",
      data_through_precision: "period",
    });
    expect(c.dataThroughPrecision).toBe("period");
    expect(c.noDataAfter).toBe(true);
    expect(
      caption({
        data_through: "2026-02-15",
        data_through_precision: "day",
        series: [{ name: "All", points: months(2) }],
      }).noDataAfter,
    ).toBe(false);
  });

  it("falls back to period for older month payloads and day for Day or aggregates", () => {
    expect(caption({ data_through: "2026-02-01" }).dataThroughPrecision).toBe(
      "period",
    );
    expect(
      caption({ data_through: "2026-02-01", unit: "Day" }).dataThroughPrecision,
    ).toBe("day");
    expect(
      view(aggregate({ data_through: "2026-02-01" }))!.caption
        .dataThroughPrecision,
    ).toBe("day");
  });

  it("rejects a bad precision or others_count", () => {
    expect(view(payload({ data_through_precision: "week" }))).toBeNull();
    expect(view(payload({ others_count: -1 }))).toBeNull();
    expect(view(payload({ others_count: "3" }))).toBeNull();
  });
});

describe("shown of total", () => {
  it("adds others_count to what arrived, and knows nothing without it", () => {
    expect(
      view(aggregate({ has_more: true, others_count: 7 }))!.caption.total,
    ).toBe(10);
    expect(view(aggregate({ has_more: true }))!.caption.total).toBeUndefined();
    expect(
      view(aggregate({ has_more: true, others_count: null }))!.caption.total,
    ).toBeUndefined();
    expect(view(aggregate())!.caption).toMatchObject({
      hasMore: false,
      total: 3,
      groupNoun: "resources",
    });
    expect(view(payload())!.caption.groupNoun).toBe("groups");
  });
});

describe("parsing once per tool message", () => {
  it("reads each tool message's artifact once across new message arrays", () => {
    let reads = 0;
    const artifact = {
      get structured_content() {
        reads++;
        return { chart: payload() };
      },
    };
    const messages = [human("h"), ai("a0"), tool("t1", artifact), ai("a1")];

    const first = chartViewsByMessage([...messages]).get("a1")![0];
    const second = chartViewsByMessage([...messages, ai("a1")]).get("a1")![0];
    latestChartViews([...messages]);

    expect(reads).toBe(1);
    expect(second).toBe(first);
  });

  it("builds a new view when the answer's message changes", () => {
    const messages = turn(payload());
    const before = chartViewsByMessage(messages).get("a1")![0];
    const after = chartViewsByMessage([...messages.slice(0, 3), ai("a2")]).get(
      "a2",
    )![0];
    expect(after).not.toBe(before);
    expect(after.messageId).toBe("a2");
  });
});
