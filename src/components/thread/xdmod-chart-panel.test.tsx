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

function tree(onAsk: (text: string) => void = () => {}) {
  return (
    <ArtifactProvider>
      <Slots />
      {/* First, so winning the panel can't depend on mounting last. */}
      <XdmodChartPanel onAsk={onAsk} />
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
        "XDMoD has data through Oct 1, 2026, so Oct 2026 may be partial.",
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
    useMessages(turn(payload({ data_through: "2026-10-01" })));
    const { unmount } = render(tree());
    expect(
      screen.getByText("XDMoD has data through Oct 1, 2026."),
    ).toBeTruthy();
    unmount();

    useMessages(turn(payload()));
    render(tree());
    expect(screen.queryByText(/has data through/)).toBeNull();
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

  it("asks a follow-up as if typed", () => {
    const onAsk = vi.fn();
    useMessages(turn(payload({ unit: "Day" })));
    render(tree(onAsk));
    fireEvent.click(
      screen.getByRole("button", { name: "Show this by month instead" }),
    );
    expect(onAsk).toHaveBeenCalledWith("Show this by month instead");
  });

  it("links to the chart in XDMoD in a new tab", () => {
    useMessages(turn(payload()));
    render(tree());
    const link = screen.getByRole("link", { name: /Open in XDMoD/ });
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
