import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it } from "vitest";
import { chartViewsByMessage, latestChartView } from "./xdmod-chart";

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
  return latestChartView(turn(p));
}

describe("chartViewsByMessage", () => {
  it("builds a line view keyed by tool call and the turn's final AI message", () => {
    const views = chartViewsByMessage(turn(payload()));
    expect([...views.keys()]).toEqual(["a1"]);
    const v = views.get("a1")!;
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

  it("yields one view per turn, the later call, and one per turn overall", () => {
    const messages = [
      human("h1"),
      tool("t1", chart(payload())),
      tool("t2", chart(payload({ link: "second" }))),
      ai("a1"),
      human("h2"),
      tool("t3", chart(aggregate())),
      ai("a2"),
    ];
    const views = chartViewsByMessage(messages);
    expect(views.size).toBe(2);
    expect(views.get("a1")!.key).toBe("t2");
    expect(views.get("a2")!.key).toBe("t3");
    expect(latestChartView(messages)!.key).toBe("t3");
  });

  it("falls back to an earlier chart when a later call in the turn isn't chart-worthy", () => {
    const v = chartViewsByMessage([
      human("h"),
      tool("t1", chart(payload())),
      tool("t2", { timed_out: true }),
      ai("a"),
    ]);
    expect(v.get("a")!.key).toBe("t1");
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

  it("returns null with no charts", () => {
    expect(latestChartView([human("h"), ai("a")])).toBeNull();
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

    it("flags resources that can't be compared on CPU hours or SU", () => {
      expect(view(aggregate())!.caption.warnings).toContain(
        "not-comparable-across-resources",
      );
      expect(
        view(aggregate({ statistic: "total_su" }))!.caption.warnings,
      ).toContain("not-comparable-across-resources");
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

  describe("followUps", () => {
    it("offers monthly for Day unit, capped at three", () => {
      const v = view(payload({ unit: "Day" }))!;
      expect(v.followUps).toContain("Show this by month instead");
      expect(v.followUps.length).toBeLessThanOrEqual(3);
    });

    it("offers a resource comparison for one series, with ACEs when needed", () => {
      expect(view(payload({ statistic: "job_count" }))!.followUps).toContain(
        "Compare this across resources",
      );
      expect(
        view(
          payload({
            group_by: "resource",
            dimension: { name: "resource", ordered: false },
          }),
        )!.followUps,
      ).toContain("Compare this across resources using ACEs");
    });

    it("offers it for one filtered resource", () => {
      const v = view(
        aggregate({
          group_by: "queue",
          dimension: { name: "queue", ordered: false },
          statistic: "job_count",
          filters: { notes: ["Resource: Anvil"] },
        }),
      )!;
      expect(v.followUps).toContain("Compare this across resources");
    });

    it("offers wait time by job size and the job-size mix", () => {
      const v = view(payload({ statistic: "avg_waitduration_hours" }))!;
      expect(v.followUps).toContain("Show wait time by job size");
      expect(view(payload())!.followUps).toContain(
        "Show the job-size mix for this period",
      );
      const sized = view(
        aggregate({
          group_by: "jobsize",
          dimension: { name: "jobsize", ordered: true },
        }),
      )!;
      expect(sized.followUps).not.toContain(
        "Show the job-size mix for this period",
      );
    });
  });
});
