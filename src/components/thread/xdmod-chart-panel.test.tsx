import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Message } from "@langchain/langgraph-sdk";
import { describe, expect, it, vi } from "vitest";
import { useStreamContext } from "@/providers/Stream";
import {
  ArtifactContent,
  ArtifactProvider,
  ArtifactTitle,
  useArtifactOpen,
} from "./artifact";
import { RegistrationPanel } from "./registration-panel";
import { SoftwareComparisonPanel } from "./software-comparison-panel";
import { XdmodChartPanel, showChart } from "./xdmod-chart-panel";
import { ChartTable, XdmodChart } from "./xdmod-chart";

vi.mock("@/providers/Stream", () => ({ useStreamContext: vi.fn() }));

type Json = Record<string, unknown>;

function payload(over: Json = {}): Json {
  return {
    version: 1,
    realm: "Jobs",
    statistic: "total_cpu_hours",
    group_by: "none",
    dataset_type: "timeseries",
    unit: "Month",
    requested: { start: "2026-06-01", end: "2026-10-31" },
    counted: { start: "2026-06-01", end: "2026-10-31" },
    last_period_incomplete: false,
    measure: {
      label: "CPU Hours: Total",
      description: "Total CPU hours used by jobs.",
      kind: "total",
      missing: "gap",
    },
    dimension: { name: "none", ordered: false },
    filters: { notes: [] },
    series: [
      {
        name: "All",
        points: [
          { start: "2026-06-01", value: 10 },
          { start: "2026-07-01", value: 20 },
          { start: "2026-08-01", value: 15 },
          { start: "2026-09-01", value: 25 },
          { start: "2026-10-01", value: 30 },
        ],
      },
    ],
    has_more: false,
    ranked_by: "value",
    link: "https://xdmod.access-ci.org/#main_tab_panel:usage_explorer",
    source: "XDMoD",
    retrieved: "2026-11-09",
    ...over,
  };
}

function bars(over: Json = {}): Json {
  return payload({
    dataset_type: "aggregate",
    unit: undefined,
    series: undefined,
    group_by: "resource",
    dimension: { name: "resource", ordered: false },
    categories: [
      { name: "Bridges-2", value: 5 },
      { name: "Delta", value: 50 },
      { name: "Anvil", value: 20 },
    ],
    ...over,
  });
}

let ids = 0;
/** One question and its answer, with the chart tool result in between. */
function turn(p: Json, key = "call-1", answerId = `ai-${key}`): Message[] {
  ids++;
  return [
    { id: `h-${ids}`, type: "human", content: "q" },
    {
      id: `ai-pre-${key}`,
      type: "ai",
      content: "",
      tool_calls: [{ id: key, name: "get_chart_data", args: {} }],
    },
    {
      id: `tool-${key}`,
      type: "tool",
      name: "get_chart_data",
      tool_call_id: key,
      content: "text",
      artifact: { structured_content: { chart: p } },
    },
    { id: answerId, type: "ai", content: "Here it is." },
  ] as unknown as Message[];
}

/** One answer that charted two measures in parallel. */
function twoChartTurn(order: "in-order" | "reversed" = "in-order"): Message[] {
  const wait = payload({
    statistic: "avg_waitduration_hours",
    measure: {
      label: "Wait Hours: Per Job",
      description: "Average wait.",
      kind: "average",
      missing: "gap",
    },
  });
  const results = [
    {
      id: "tool-wait",
      type: "tool",
      name: "get_chart_data",
      tool_call_id: "wait",
      content: "text",
      artifact: { structured_content: { chart: wait } },
    },
    {
      id: "tool-jobs",
      type: "tool",
      name: "get_chart_data",
      tool_call_id: "jobs",
      content: "text",
      artifact: {
        structured_content: {
          chart: bars({
            statistic: "job_count",
            measure: {
              label: "Number of Jobs Ended",
              description: "Jobs that ended.",
              kind: "total",
              missing: "zero",
            },
          }),
        },
      },
    },
  ];
  if (order === "reversed") results.reverse();
  return [
    { id: "h-two", type: "human", content: "Wait time on Delta?" },
    {
      id: "ai-pre-two",
      type: "ai",
      content: "",
      tool_calls: [
        { id: "wait", name: "get_chart_data", args: {} },
        { id: "jobs", name: "get_chart_data", args: {} },
      ],
    },
    ...results,
    { id: "ai-two", type: "ai", content: "Wait time went up." },
  ] as unknown as Message[];
}

function Slots() {
  const [open, close] = useArtifactOpen();
  return (
    <>
      <p>{open ? "panel open" : "panel closed"}</p>
      <button
        type="button"
        onClick={close}
      >
        close
      </button>
      <ArtifactTitle />
      <ArtifactContent />
    </>
  );
}

const stream = vi.mocked(useStreamContext);
const useMessages = (messages: Message[], isLoading = false) =>
  stream.mockReturnValue({ messages, isLoading } as never);

function tree(onAsk: (text: string) => void = () => {}, awaitingCheck = false) {
  return (
    <ArtifactProvider>
      <Slots />
      {/* First, so winning the panel can't depend on mounting last. */}
      <XdmodChartPanel
        onAsk={onAsk}
        awaitingCheck={awaitingCheck}
      />
      <RegistrationPanel onConfirm={() => {}} />
      <SoftwareComparisonPanel />
    </ArtifactProvider>
  );
}

const solidLines = (c: HTMLElement) =>
  [...c.querySelectorAll("path.recharts-line-curve")].filter(
    (p) => !p.getAttribute("stroke-dasharray"),
  );
const dashedLines = (c: HTMLElement) =>
  [...c.querySelectorAll("path.recharts-line-curve")].filter((p) =>
    p.getAttribute("stroke-dasharray"),
  );
const ticks = (c: HTMLElement, axis: "x" | "y") =>
  [
    ...c.querySelectorAll(
      `.recharts-${axis}Axis-tick-labels .recharts-cartesian-axis-tick-value`,
    ),
  ].map((t) => t.textContent);

describe("XdmodChartPanel", () => {
  it("shows nothing without a chart", () => {
    useMessages([]);
    render(tree());
    expect(screen.getByText("panel closed")).toBeTruthy();
    expect(document.querySelector("svg.recharts-surface")).toBeNull();
  });

  it("opens for the latest chart and replaces it when a newer one arrives", () => {
    const first = turn(payload(), "c1");
    useMessages(first);
    const { rerender } = render(tree());
    expect(screen.getByText("panel open")).toBeTruthy();
    expect(
      screen.getByText("CPU Hours: Total: Total CPU hours used by jobs."),
    ).toBeTruthy();

    useMessages([
      ...first,
      ...turn(
        payload({
          measure: {
            label: "Wait Hours: Per Job",
            description: "Average wait.",
            kind: "average",
            missing: "gap",
          },
          statistic: "avg_waitduration_hours",
        }),
        "c2",
      ),
    ]);
    rerender(tree());
    expect(screen.getByText("Wait Hours: Per Job: Average wait.")).toBeTruthy();
    expect(screen.queryByText(/Total CPU hours used by jobs/)).toBeNull();
  });

  it("shows the answer's first chart and switches to the others", () => {
    // The context call finished first; tool-call order still wins.
    useMessages(twoChartTurn("reversed"));
    const { container } = render(tree());
    expect(screen.getByText("Wait Hours: Per Job: Average wait.")).toBeTruthy();

    const switcher = screen.getByRole("group", {
      name: "Charts in this answer",
    });
    const buttons = within(switcher).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Wait Hours: Per Job",
      "Number of Jobs Ended",
    ]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual([
      "true",
      "false",
    ]);

    fireEvent.click(buttons[1]);
    expect(
      screen.getByText("Number of Jobs Ended: Jobs that ended."),
    ).toBeTruthy();
    expect(ticks(container, "y")).toEqual(["Delta", "Anvil", "Bridges-2"]);
    expect(
      within(switcher)
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-pressed")),
    ).toEqual(["false", "true"]);
  });

  it("has no switcher for a single chart", () => {
    useMessages(turn(payload()));
    render(tree());
    expect(
      screen.queryByRole("group", { name: "Charts in this answer" }),
    ).toBeNull();
  });

  it("reopens an earlier two-chart answer on its first chart", () => {
    useMessages([...twoChartTurn(), ...turn(payload(), "later")]);
    render(tree());
    expect(
      screen.queryByRole("group", { name: "Charts in this answer" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "close" }));

    act(() => showChart("wait"));
    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByText("Wait Hours: Per Job: Average wait.")).toBeTruthy();
    expect(
      screen.getByRole("group", { name: "Charts in this answer" }),
    ).toBeTruthy();
  });

  it("keeps the picked chart while the answer finishes streaming", () => {
    const messages = twoChartTurn();
    useMessages(messages.slice(0, -1), true);
    const { rerender } = render(tree());
    fireEvent.click(
      screen.getByRole("button", { name: "Number of Jobs Ended" }),
    );

    useMessages(messages, false);
    rerender(tree());
    expect(
      screen.getByText("Number of Jobs Ended: Jobs that ended."),
    ).toBeTruthy();
  });

  it("draws one line per series with a legend", () => {
    const series = ["Delta", "Anvil"].map((name, i) => ({
      name,
      points: [
        { start: "2026-08-01", value: 10 + i },
        { start: "2026-09-01", value: 20 + i },
      ],
    }));
    useMessages(turn(payload({ series })));
    const { container } = render(tree());

    expect(solidLines(container)).toHaveLength(2);
    expect(dashedLines(container)).toHaveLength(0);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Delta", "Anvil"]);
  });

  it("has no legend for a single series", () => {
    useMessages(turn(payload()));
    render(tree());
    expect(screen.queryByRole("list", { name: "Legend" })).toBeNull();
  });

  it("draws an incomplete last period dashed", () => {
    useMessages(turn(payload({ last_period_incomplete: true })));
    const { container } = render(tree());

    const [dashed] = dashedLines(container);
    expect(dashed).toBeTruthy();
    // Only the last segment: two points.
    expect(dashed.getAttribute("d")).toMatch(/^M[\d.,]+L[\d.,]+$/);
    expect(dashed.getAttribute("stroke")).toBe(
      solidLines(container)[0].getAttribute("stroke"),
    );
  });

  it("draws the line into a partial data_through month dashed", () => {
    useMessages(
      turn(
        payload({
          counted: { start: "2026-06-01", end: "2026-11-08" },
          data_through: "2026-10-01",
          last_data_period_partial: true,
          series: [
            {
              name: "All",
              points: [
                { start: "2026-06-01", value: 10 },
                { start: "2026-07-01", value: 20 },
                { start: "2026-08-01", value: 15 },
                { start: "2026-09-01", value: 25 },
                { start: "2026-10-01", value: 1 },
                { start: "2026-11-01", value: null },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    const [dashed] = dashedLines(container);
    expect(dashed.getAttribute("d")).toMatch(/^M[\d.,]+L[\d.,]+$/);
    // The solid line stops at September: four points, three segments.
    expect(
      solidLines(container)[0].getAttribute("d")?.match(/L/g),
    ).toHaveLength(3);
    expect(
      screen.getByText(
        "XDMoD has no data after Oct 2026, so Oct 2026 may be partial.",
      ),
    ).toBeTruthy();
  });

  it("dashes into the month that contains a mid-month data_through", () => {
    useMessages(
      turn(
        payload({
          counted: { start: "2026-06-01", end: "2026-11-08" },
          data_through: "2026-10-19",
          data_through_precision: "day",
          last_data_period_partial: true,
          series: [
            {
              name: "All",
              points: [
                { start: "2026-06-01", value: 10 },
                { start: "2026-07-01", value: 20 },
                { start: "2026-08-01", value: 15 },
                { start: "2026-09-01", value: 25 },
                { start: "2026-10-01", value: 12 },
                { start: "2026-11-01", value: null },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    expect(dashedLines(container)[0].getAttribute("d")).toMatch(
      /^M[\d.,]+L[\d.,]+$/,
    );
    expect(
      solidLines(container)[0].getAttribute("d")?.match(/L/g),
    ).toHaveLength(3);
    expect(
      screen.getByText(
        "XDMoD has data through Oct 19, 2026, so Oct 2026 may be partial.",
      ),
    ).toBeTruthy();
  });

  it("dashes into the quarter that contains a mid-quarter data_through", () => {
    useMessages(
      turn(
        payload({
          unit: "Quarter",
          counted: { start: "2026-01-01", end: "2026-12-31" },
          data_through: "2026-08-15",
          data_through_precision: "day",
          last_data_period_partial: true,
          series: [
            {
              name: "All",
              points: [
                { start: "2026-01-01", value: 10 },
                { start: "2026-04-01", value: 20 },
                { start: "2026-07-01", value: 8 },
                { start: "2026-10-01", value: null },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    expect(dashedLines(container)).toHaveLength(1);
    expect(
      solidLines(container)[0].getAttribute("d")?.match(/L/g),
    ).toHaveLength(1);
    expect(
      screen.getByText(
        "XDMoD has data through Aug 15, 2026, so Q3 2026 may be partial.",
      ),
    ).toBeTruthy();
  });

  it("names a partial day by its date", () => {
    const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
    useMessages(
      turn(
        payload({
          unit: "Day",
          counted: { start: "2026-09-28", end: "2026-10-05" },
          data_through: "2026-10-01",
          last_data_period_partial: true,
          series: [
            {
              name: "All",
              points: days.map((start, i) => ({ start, value: 5 + i })),
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    expect(dashedLines(container)).toHaveLength(1);
    expect(
      screen.getByText(
        "XDMoD has data through Oct 1, 2026, so Oct 1, 2026 may be partial.",
      ),
    ).toBeTruthy();
  });

  it("draws no partial dashes without the flag", () => {
    useMessages(
      turn(
        payload({
          counted: { start: "2026-06-01", end: "2026-11-08" },
          data_through: "2026-10-01",
          data_through_precision: "day",
        }),
      ),
    );
    const { container } = render(tree());
    expect(dashedLines(container)).toHaveLength(0);
    expect(
      screen.getByText("XDMoD has data through Oct 1, 2026."),
    ).toBeTruthy();
    expect(screen.queryByText(/may be partial/)).toBeNull();
  });

  it("draws nothing after the data_through point", () => {
    useMessages(
      turn(
        payload({
          measure: {
            label: "Number of Jobs Ended",
            description: "Jobs that ended.",
            kind: "total",
            missing: "zero",
          },
          statistic: "job_count",
          counted: { start: "2026-06-01", end: "2026-11-08" },
          data_through: "2026-09-01",
          series: [
            {
              name: "All",
              points: [
                { start: "2026-06-01", value: 10 },
                { start: "2026-07-01", value: 20 },
                { start: "2026-08-01", value: 15 },
                { start: "2026-09-01", value: 25 },
                { start: "2026-10-01", value: null },
                { start: "2026-11-01", value: null },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    const [line] = solidLines(container);
    // One run, June to September: three segments, nothing dropping to zero.
    expect(line.getAttribute("d")?.match(/M/g)).toHaveLength(1);
    expect(line.getAttribute("d")?.match(/L/g)).toHaveLength(3);
  });

  it("leaves a gap where a value is missing", () => {
    useMessages(
      turn(
        payload({
          series: [
            {
              name: "All",
              points: [
                { start: "2026-06-01", value: 10 },
                { start: "2026-07-01", value: 20 },
                { start: "2026-08-01", value: null },
                { start: "2026-09-01", value: 25 },
                { start: "2026-10-01", value: 30 },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    const d = solidLines(container)[0].getAttribute("d") ?? "";
    expect(d.match(/M/g)).toHaveLength(2);
  });

  it("still draws the newest value when the period before it is missing", () => {
    useMessages(
      turn(
        payload({
          last_period_incomplete: true,
          series: [
            {
              name: "All",
              points: [
                { start: "2026-06-01", value: 10 },
                { start: "2026-07-01", value: 20 },
                { start: "2026-08-01", value: 15 },
                { start: "2026-09-01", value: null },
                { start: "2026-10-01", value: 30 },
              ],
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    const stroke = solidLines(container)[0].getAttribute("stroke");
    const dots = [...container.querySelectorAll("circle")].filter(
      (c) => c.getAttribute("fill") === stroke,
    );
    expect(dots).toHaveLength(1);
  });

  it("draws ranked bars across, biggest first", () => {
    useMessages(turn(bars()));
    const { container } = render(tree());
    expect(ticks(container, "y")).toEqual(["Delta", "Anvil", "Bridges-2"]);
    expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(
      3,
    );
  });

  it("draws ordered bars upright, in the payload's order", () => {
    useMessages(
      turn(
        bars({
          group_by: "jobsize",
          dimension: { name: "jobsize", ordered: true },
          categories: [
            { name: "1 - 16", value: 5 },
            { name: "17 - 64", value: 50 },
            { name: "65+", value: 20 },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    expect(ticks(container, "x")).toEqual(["1 - 16", "17 - 64", "65+"]);
  });

  it("captions the chart with what was counted and its caveats", () => {
    useMessages(
      turn(
        payload({
          statistic: "avg_waitduration_hours",
          last_period_incomplete: true,
          has_more: true,
          filters: { notes: ["Resource is Delta", "Queue is gpu"] },
        }),
      ),
    );
    render(tree());
    for (const text of [
      "CPU Hours: Total: Total CPU hours used by jobs.",
      "Jun 1, 2026 to Oct 31, 2026, by month",
      "Filtered to Resource is Delta; Queue is gpu",
      "Showing the top 1; XDMoD has more.",
      "The last period is still in progress.",
      "Jobs still waiting aren't counted, and the last few days may be incomplete.",
      "This is an average per job, so a few long jobs can pull it up.",
      "Source: XDMoD, retrieved Nov 9, 2026",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("says where XDMoD's data stops when it's before the range ends", () => {
    useMessages(
      turn(
        payload({ data_through: "2026-10-01", data_through_precision: "day" }),
      ),
    );
    const { unmount } = render(tree());
    expect(
      screen.getByText("XDMoD has data through Oct 1, 2026."),
    ).toBeTruthy();
    unmount();

    // A month start isn't where the data stops: October may be full.
    useMessages(
      turn(
        payload({
          data_through: "2026-10-01",
          data_through_precision: "period",
        }),
      ),
    );
    const second = render(tree());
    expect(
      screen.queryByText(/XDMoD has (data through|no data after)/),
    ).toBeNull();
    second.unmount();

    useMessages(turn(payload()));
    render(tree());
    expect(screen.queryByText(/has data through/)).toBeNull();
  });

  it("gives an aggregate the recent-data warning and where its data stops", () => {
    useMessages(
      turn(
        bars({
          group_by: "fieldofscience",
          dimension: { name: "fieldofscience", ordered: false },
          requested: { start: "2026-01-01", end: "2026-11-09" },
          counted: { start: "2026-01-01", end: "2026-11-09" },
          last_period_incomplete: true,
          data_through: "2026-10-01",
          data_through_precision: "day",
        }),
      ),
    );
    render(tree());
    for (const text of [
      "XDMoD has data through Oct 1, 2026.",
      "The range runs to today, so it's still in progress.",
      "Jobs still waiting aren't counted, and the last few days may be incomplete.",
    ]) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });

  it("doesn't draw a series as dropping to 0 after its own data ends", () => {
    const day = (d: number) => `2026-10-${String(d).padStart(2, "0")}`;
    useMessages(
      turn(
        payload({
          unit: "Day",
          measure: {
            label: "Number of Jobs Ended",
            description: "Jobs.",
            kind: "total",
            missing: "zero",
          },
          group_by: "resource",
          dimension: { name: "resource", ordered: false },
          counted: { start: day(18), end: day(21) },
          data_through: day(21),
          data_through_precision: "day",
          series: [
            {
              name: "Anvil",
              points: [18, 19, 20, 21].map((d) => ({
                start: day(d),
                value: d <= 19 ? 5 : null,
              })),
            },
            {
              name: "Delta",
              points: [18, 19, 20, 21].map((d) => ({
                start: day(d),
                value: 7,
              })),
            },
            {
              name: "Empty",
              points: [18, 19, 20, 21].map((d) => ({
                start: day(d),
                value: null,
              })),
            },
          ],
        }),
      ),
    );
    const { container } = render(tree());
    // Anvil's line has two points (one segment), not four.
    const [anvil] = solidLines(container);
    expect(anvil.getAttribute("d")?.match(/L/g)).toHaveLength(1);
    const legend = screen.getByRole("list", { name: "Legend" });
    expect(within(legend).queryByText("Empty")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByText("—")).toHaveLength(2);
    expect(within(table).queryByText("0")).toBeNull();
  });

  it("draws at most ten series and says how many there were", () => {
    const series = Array.from({ length: 12 }, (_, i) => ({
      name: `R${String(i).padStart(2, "0")}`,
      points: [
        { start: "2026-06-01", value: 12 - i },
        { start: "2026-07-01", value: 12 - i },
      ],
    }));
    useMessages(
      turn(
        payload({
          group_by: "resource",
          dimension: { name: "resource", ordered: false },
          series,
        }),
      ),
    );
    const { container } = render(tree());
    expect(solidLines(container)).toHaveLength(10);
    expect(
      screen.getByText("Showing the top 10 of 12 resources."),
    ).toBeTruthy();
  });

  it("says how many XDMoD left out when it says", () => {
    useMessages(
      turn(
        bars({
          group_by: "fieldofscience",
          dimension: { name: "fieldofscience", ordered: false },
          has_more: true,
          others_count: 38,
        }),
      ),
    );
    const { unmount } = render(tree());
    expect(
      screen.getByText("Showing the top 3 of 41 fields of science."),
    ).toBeTruthy();
    unmount();

    useMessages(
      turn(
        bars({
          group_by: "jobsize",
          dimension: { name: "jobsize", ordered: true },
          has_more: true,
          others_count: 2,
        }),
      ),
    );
    render(tree());
    expect(screen.getByText("Showing 3 of 5 buckets.")).toBeTruthy();
  });

  it("shows a small average without rounding it to 0", () => {
    useMessages(
      turn(
        bars({
          statistic: "avg_waitduration_hours",
          categories: [
            { name: "Delta", value: 0.004 },
            { name: "Anvil", value: 1234.567 },
          ],
        }),
      ),
    );
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table");
    expect(within(table).getByText("0.004")).toBeTruthy();
    expect(within(table).getByText("1,234.57")).toBeTruthy();
  });

  it("redraws the chart only when its view changes", () => {
    // The views are cached per tool message, so memo skips a streamed token.
    const memoType = Symbol.for("react.memo");
    expect((XdmodChart as unknown as { $$typeof: symbol }).$$typeof).toBe(
      memoType,
    );
    expect((ChartTable as unknown as { $$typeof: symbol }).$$typeof).toBe(
      memoType,
    );
  });

  it("opens a filtered chart that has no XDMoD link", () => {
    useMessages(
      turn(
        payload({
          link: null,
          filters: { notes: ["Resource is Delta"] },
        }),
      ),
    );
    render(tree());
    expect(screen.getByText("panel open")).toBeTruthy();
    expect(screen.getByText("Filtered to Resource is Delta")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /XDMoD/ })).toBeNull();
    expect(screen.queryByText(/default dates/)).toBeNull();
  });

  it("links to XDMoD only over https", () => {
    useMessages(turn(payload({ link: "javascript:alert(1)" })));
    render(tree());
    expect(
      screen.queryByRole("link", { name: "Explore this measure in XDMoD" }),
    ).toBeNull();
    expect(
      screen.getByText("Source: XDMoD, retrieved Nov 9, 2026"),
    ).toBeTruthy();
  });

  it("warns that CPU hours aren't comparable across resources", () => {
    useMessages(turn(bars()));
    render(tree());
    expect(
      screen.getByText(
        "CPU hours and SUs aren't comparable across resources. ACE measures are.",
      ),
    ).toBeTruthy();
  });

  it("shows the same numbers as a table, one row per period", () => {
    const series = [
      {
        name: "Delta",
        points: [
          { start: "2026-08-01", value: 1234.5 },
          { start: "2026-09-01", value: null },
        ],
      },
      {
        name: "Anvil",
        points: [
          { start: "2026-08-01", value: 3 },
          { start: "2026-09-01", value: 4 },
        ],
      },
    ];
    useMessages(turn(payload({ series })));
    render(tree());

    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const table = screen.getByRole("table");
    const rows = within(table)
      .getAllByRole("row")
      .map((r) => [...r.querySelectorAll("th, td")].map((c) => c.textContent));
    expect(rows).toEqual([
      ["Month", "Delta", "Anvil"],
      ["Aug 2026", "1,234.5", "3"],
      ["Sep 2026", "—", "4"],
    ]);
  });

  it("shows bars as a table, one row per bar", () => {
    useMessages(turn(bars()));
    render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Table" }));
    const rows = within(screen.getByRole("table"))
      .getAllByRole("row")
      .map((r) => r.textContent);
    expect(rows).toEqual([
      "ResourceCPU Hours: Total",
      "Delta50",
      "Anvil20",
      "Bridges-25",
    ]);
  });

  it("offers the answer's suggested questions and asks one as if typed", () => {
    const onAsk = vi.fn();
    const messages = turn(payload());
    messages[3] = {
      ...messages[3],
      additional_kwargs: {
        suggested_questions: [
          "How does this compare to last year?",
          "Which resources used the most?",
        ],
      },
    } as Message;
    useMessages(messages);
    render(tree(onAsk));
    const next = screen.getByRole("region", { name: "Ask next" });
    expect(within(next).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(
      within(next).getByRole("button", {
        name: "Which resources used the most?",
      }),
    );
    expect(onAsk).toHaveBeenCalledWith("Which resources used the most?");
  });

  it("sends nothing while the Turnstile check is showing", () => {
    const onAsk = vi.fn();
    const messages = turn(payload());
    messages[3] = {
      ...messages[3],
      additional_kwargs: { suggested_questions: ["What about Delta?"] },
    } as Message;
    useMessages(messages);
    render(tree(onAsk, true));
    const button = screen.getByRole("button", { name: "What about Delta?" });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onAsk).not.toHaveBeenCalled();
  });

  it("has no Ask next when the answer suggests nothing", () => {
    useMessages(turn(payload({ unit: "Day" })));
    render(tree());
    expect(document.querySelector("svg.recharts-surface")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Ask next" })).toBeNull();
    expect(screen.queryByText("Ask next")).toBeNull();
  });

  it("shows the suggestions of the answer that drew the picked chart", () => {
    const older = turn(payload(), "old");
    older[3] = {
      ...older[3],
      additional_kwargs: { suggested_questions: ["Older question?"] },
    } as Message;
    const newer = turn(bars(), "new");
    newer[3] = {
      ...newer[3],
      additional_kwargs: { suggested_questions: ["Newer question?"] },
    } as Message;
    useMessages([...older, ...newer]);
    render(tree());
    expect(
      screen.getByRole("button", { name: "Newer question?" }),
    ).toBeTruthy();
    act(() => showChart("old"));
    expect(
      screen.getByRole("button", { name: "Older question?" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Newer question?" }),
    ).toBeNull();
  });

  it("links to the measure in XDMoD in a new tab, saying its dates differ", () => {
    useMessages(turn(payload()));
    render(tree());
    expect(screen.queryByText(/Open in XDMoD/)).toBeNull();
    const link = screen.getByRole("link", {
      name: "Explore this measure in XDMoD",
    });
    expect(link.parentElement?.textContent).toContain(
      "Explore this measure in XDMoD (opens with XDMoD's default dates)",
    );
    expect(link.getAttribute("href")).toBe(
      "https://xdmod.access-ci.org/#main_tab_panel:usage_explorer",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("keeps the table open while the answer finishes streaming", () => {
    const [h, pre, tool] = turn(payload(), "c1");
    useMessages([h, pre, tool], true);
    const { rerender } = render(tree());
    fireEvent.click(screen.getByRole("button", { name: "Table" }));

    useMessages(
      [h, pre, tool, { id: "final", type: "ai", content: "Done." } as Message],
      false,
    );
    rerender(tree());
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("shows an earlier chart when asked", () => {
    const older = turn(bars(), "old");
    useMessages([...older, ...turn(payload(), "new")]);
    const { container } = render(tree());
    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(screen.getByText("panel closed")).toBeTruthy();

    act(() => showChart("old"));
    expect(screen.getByText("panel open")).toBeTruthy();
    expect(ticks(container, "y")).toEqual(["Delta", "Anvil", "Bridges-2"]);
  });

  const registration = [
    {
      type: "tool",
      name: "register_for_event",
      tool_call_id: "reg",
      content: JSON.stringify({ status: "preview", data: {} }),
    },
  ] as Message[];
  const comparisonResult = [
    {
      type: "tool",
      name: "compare_software_availability",
      tool_call_id: "cmp",
      content: JSON.stringify({
        requested_software: ["gromacs"],
        requested_resources: ["delta"],
        all_resources_found: ["delta"],
        comparison: [
          {
            software: "gromacs",
            found: true,
            available_on: ["delta"],
            resource_count: 1,
          },
        ],
      }),
    },
  ] as Message[];

  it("takes the panel on reload when the chart is newer than a registration", () => {
    useMessages([...registration, ...turn(payload())]);
    render(tree());
    expect(screen.getByText("panel open")).toBeTruthy();
    expect(
      screen.getByText("CPU Hours: Total: Total CPU hours used by jobs."),
    ).toBeTruthy();
    expect(screen.queryByText("Not registered yet")).toBeNull();
  });

  it("takes the panel on reload when the chart is newer than a comparison", () => {
    useMessages([...comparisonResult, ...turn(payload())]);
    render(tree());
    expect(
      screen.getByText("CPU Hours: Total: Total CPU hours used by jobs."),
    ).toBeTruthy();
    expect(screen.queryByText("Software availability")).toBeNull();
  });

  it("gives the panel to a newer software comparison on reload", () => {
    const comparison = [
      {
        type: "tool",
        name: "compare_software_availability",
        tool_call_id: "cmp",
        content: JSON.stringify({
          requested_software: ["gromacs"],
          requested_resources: ["delta"],
          all_resources_found: ["delta"],
          comparison: [
            {
              software: "gromacs",
              found: true,
              available_on: ["delta"],
              resource_count: 1,
            },
          ],
        }),
      },
    ] as Message[];
    useMessages([...turn(payload()), ...comparison]);
    render(tree());
    expect(screen.getByText("Software availability")).toBeTruthy();
  });
});
