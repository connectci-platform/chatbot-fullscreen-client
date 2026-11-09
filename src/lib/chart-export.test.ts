import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptionFacts, ChartView } from "./xdmod-chart";
import {
  captionLines,
  chartCsv,
  chartFileName,
  downloadChartPng,
  formatDay,
  wrapText,
} from "./chart-export";

const CAPTION: CaptionFacts = {
  measure: "CPU Hours: Total",
  definition: "Total CPU hours used by jobs.",
  counted: { start: "2026-08-01", end: "2026-10-31" },
  unit: "Month",
  filters: [],
  hasMore: false,
  incomplete: false,
  warnings: [],
  source: "XDMoD",
  retrieved: "2026-11-09",
};

function lineView(over: Partial<ChartView> = {}): ChartView {
  return {
    key: "call-1",
    messageId: "ai-1",
    kind: "line",
    title: "CPU Hours: Total",
    series: [
      {
        name: "Delta",
        points: [
          { start: "2026-08-01", value: 1200.5 },
          { start: "2026-09-01", value: null },
          { start: "2026-10-01", value: 900 },
        ],
      },
      {
        name: "Anvil, Purdue",
        points: [
          { start: "2026-08-01", value: 10 },
          { start: "2026-09-01", value: 20 },
          { start: "2026-10-01", value: 30 },
        ],
      },
    ],
    bars: [],
    caption: { ...CAPTION, filters: ["Resource is Delta or Anvil"] },
    link: "https://xdmod.access-ci.org/#chart",
    followUps: [],
    ...over,
  };
}

describe("formatDay", () => {
  it("formats a calendar date without shifting it by time zone", () => {
    expect(formatDay("2026-08-01")).toBe("Aug 1, 2026");
    expect(formatDay("2026-12-31")).toBe("Dec 31, 2026");
  });

  it("leaves anything it can't read alone", () => {
    expect(formatDay("last week")).toBe("last week");
  });
});

describe("captionLines", () => {
  it("names the measure, the counted range and the source", () => {
    expect(captionLines(CAPTION, 1)).toEqual([
      "CPU Hours: Total: Total CPU hours used by jobs.",
      "Aug 1, 2026 to Oct 31, 2026, by month",
      "Source: XDMoD, retrieved Nov 9, 2026",
    ]);
  });

  it("adds filters, more results, an incomplete period and each warning", () => {
    expect(
      captionLines(
        {
          ...CAPTION,
          unit: undefined,
          filters: ["Resource is Delta", "Field of science is Physics"],
          hasMore: true,
          incomplete: true,
          warnings: [
            "waiting-not-counted",
            "not-comparable-across-resources",
            "mean-of-jobs",
          ],
        },
        10,
      ),
    ).toEqual([
      "CPU Hours: Total: Total CPU hours used by jobs.",
      "Aug 1, 2026 to Oct 31, 2026",
      "Filtered to Resource is Delta; Field of science is Physics",
      "Showing the top 10; XDMoD has more.",
      "The last period is still in progress.",
      "Jobs still waiting aren't counted, and the last few days may be incomplete.",
      "CPU hours and SUs aren't comparable across resources. ACE measures are.",
      "This is an average per job, so a few long jobs can pull it up.",
      "Source: XDMoD, retrieved Nov 9, 2026",
    ]);
  });
});

describe("chartCsv", () => {
  it("starts with what was counted, then one row per period", () => {
    expect(chartCsv(lineView()).split("\n")).toEqual([
      "Measure,CPU Hours: Total",
      "Counted,2026-08-01 to 2026-10-31",
      "Filters,Resource is Delta or Anvil",
      "Retrieved,2026-11-09",
      "Source,XDMoD",
      "",
      'Period,Delta,"Anvil, Purdue"',
      "2026-08-01,1200.5,10",
      "2026-09-01,,20",
      "2026-10-01,900,30",
    ]);
  });

  it("writes one row per bar and says when nothing was filtered", () => {
    const view = lineView({
      kind: "bar-ranked",
      series: [],
      bars: [
        { name: 'The "big" one', value: 50 },
        { name: "Small", value: null },
      ],
      caption: CAPTION,
    });
    expect(chartCsv(view).split("\n").slice(2)).toEqual([
      "Filters,None",
      "Retrieved,2026-11-09",
      "Source,XDMoD",
      "",
      "Name,CPU Hours: Total",
      '"The ""big"" one",50',
      "Small,",
    ]);
  });
});

describe("chartFileName", () => {
  it("names the file after the measure and the range", () => {
    expect(chartFileName(lineView())).toBe(
      "xdmod-cpu-hours-total-2026-08-01-to-2026-10-31",
    );
  });
});

describe("wrapText", () => {
  // One unit per character keeps the arithmetic obvious.
  const measure = (s: string) => s.length;

  it("breaks between words to fit the width", () => {
    expect(wrapText("one two three four", 9, measure)).toEqual([
      "one two",
      "three",
      "four",
    ]);
  });

  it("keeps a word longer than the width on its own line", () => {
    expect(wrapText("a supercalifragilistic b", 5, measure)).toEqual([
      "a",
      "supercalifragilistic",
      "b",
    ]);
  });
});

describe("downloadChartPng", () => {
  afterEach(() => vi.restoreAllMocks());

  it("draws the chart and its caption and saves a PNG", async () => {
    const drawn: string[] = [];
    const ctx = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillText: (text: string) => drawn.push(text),
      measureText: (text: string) => ({ width: text.length * 6 }),
      font: "",
      fillStyle: "",
      textBaseline: "",
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      ctx as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
      cb(new Blob(["png"], { type: "image/png" })),
    );
    // jsdom never loads images, so load each one as soon as it's given a src.
    vi.spyOn(HTMLImageElement.prototype, "src", "set").mockImplementation(
      function (this: HTMLImageElement) {
        queueMicrotask(() => this.onload?.(new Event("load")));
      },
    );
    URL.createObjectURL = vi.fn(() => "blob:png");
    URL.revokeObjectURL = vi.fn();
    const clicks: { download: string; href: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({ download: this.download, href: this.href });
    });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "400");
    svg.setAttribute("height", "280");

    await downloadChartPng(svg, CAPTION, "my-chart", {
      legend: [
        { name: "Delta", color: "#2a78d6" },
        { name: "Anvil", color: "#eb6834" },
      ],
      shown: 2,
    });

    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(drawn).toContain("Delta");
    expect(drawn).toContain("Source: XDMoD, retrieved Nov 9, 2026");
    expect(drawn.join(" ")).toContain("Aug 1, 2026 to Oct 31, 2026, by month");
    expect(clicks).toEqual([{ download: "my-chart.png", href: "blob:png" }]);
  });
});
