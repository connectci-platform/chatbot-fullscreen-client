import { afterEach, describe, expect, it, vi } from "vitest";
import type { CaptionFacts, ChartView } from "./xdmod-chart";
import {
  captionLines,
  chartCsv,
  chartFileName,
  downloadChartPng,
  formatDay,
  periodContaining,
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
    dimension: "Name",
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

describe("periodContaining", () => {
  const months = ["2026-08-01", "2026-09-01", "2026-10-01T00:00:00"];

  it("finds the period a day falls in, not just an exact start", () => {
    expect(periodContaining(months, "2026-10-19")).toBe(2);
    expect(periodContaining(months, "2026-09-01")).toBe(1);
    expect(periodContaining(months, "2026-08-31")).toBe(0);
  });

  it("is -1 before the first period", () => {
    expect(periodContaining(months, "2026-07-15")).toBe(-1);
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
      "Filtered to Resource is Delta; Field of science is Physics",
      "Aug 1, 2026 to Oct 31, 2026",
      "Showing the top 10; XDMoD has more.",
      "The range runs to today, so it's still in progress.",
      "Jobs still waiting aren't counted, and the last few days may be incomplete.",
      "CPU hours don't allow for each resource's compute power per core, so they aren't comparable across resources. ACE measures are.",
      "This is an average per job, so a few long jobs can pull it up.",
      "Source: XDMoD, retrieved Nov 9, 2026",
    ]);
  });
});

describe("captionLines past the top", () => {
  it("says which ranks a chart with an offset shows", () => {
    const paged = { ...CAPTION, offset: 3, groupNoun: "fields of science" };
    expect(captionLines({ ...paged, hasMore: true, total: 79 }, 5)).toContain(
      "Showing ranks 4 to 8 of 79 fields of science, not the top 3.",
    );
    expect(captionLines({ ...paged, hasMore: true }, 5)).toContain(
      "Showing ranks 4 to 8, not the top 3; XDMoD has more.",
    );
    // The last page: nothing more, but still not the top.
    expect(captionLines(paged, 5)).toContain(
      "Showing ranks 4 to 8, not the top 3.",
    );
    expect(
      captionLines({ ...paged, ordered: true, hasMore: true, total: 11 }, 5),
    ).toContain("Showing 5 of 11 buckets, leaving out the 3 largest.");
    expect(captionLines({ ...paged, ordered: true }, 5)).toContain(
      "Showing 5 buckets, leaving out the 3 largest.",
    );
    expect(captionLines(paged, 5).join("\n")).not.toContain("the top 5");
  });
});

describe("captionLines with early ends", () => {
  it("names each series that stops before the rest", () => {
    expect(
      captionLines(
        {
          ...CAPTION,
          earlyEnds: [
            {
              name: "Purdue Anvil CPU",
              through: "2026-10-19",
              precision: "day",
            },
            { name: "IACS Ookami", through: "2026-09-01", precision: "period" },
          ],
        },
        2,
      ),
    ).toContain(
      "Some data stops earlier: Purdue Anvil CPU through Oct 19, 2026; IACS Ookami, nothing after Sep 2026.",
    );
  });
});

describe("captionLines with data_through", () => {
  it("says where XDMoD's data stops, right after the range", () => {
    expect(
      captionLines(
        {
          ...CAPTION,
          dataThrough: "2026-10-01",
          dataThroughPrecision: "day",
        },
        1,
      ).slice(0, 3),
    ).toEqual([
      "CPU Hours: Total: Total CPU hours used by jobs.",
      "Aug 1, 2026 to Oct 31, 2026, by month",
      "XDMoD has data through Oct 1, 2026.",
    ]);
  });

  it("doesn't print a period start as the day data stops", () => {
    // Aug to Oct by month, October populated: Oct 1 is only its start.
    const period = {
      ...CAPTION,
      dataThrough: "2026-10-01",
      dataThroughPrecision: "period" as const,
    };
    expect(captionLines(period, 1).join("\n")).not.toMatch(
      /has data through|no data after/,
    );
    // With empty months after it, say which period the data ends in.
    expect(
      captionLines(
        {
          ...period,
          dataThrough: "2026-09-01",
          noDataAfter: true,
          counted: { start: "2026-08-01", end: "2026-11-30" },
        },
        1,
      )[2],
    ).toBe("XDMoD has no data after Sep 2026.");
  });

  it("says how many it shows of how many", () => {
    const more = { ...CAPTION, hasMore: true, total: 41 };
    expect(captionLines({ ...more, groupNoun: "resources" }, 10)).toContain(
      "Showing the top 10 of 41 resources.",
    );
    expect(captionLines(more, 10)).toContain(
      "Showing the top 10 of 41 groups.",
    );
    expect(captionLines({ ...more, ordered: true }, 10)).toContain(
      "Showing 10 of 41 buckets.",
    );
  });

  it("says nothing when the data reaches the end of the range", () => {
    expect(
      captionLines({ ...CAPTION, dataThrough: "2026-10-31" }, 1).join("\n"),
    ).not.toContain("has data through");
  });
});

describe("captionLines with a partial period", () => {
  const partial = {
    ...CAPTION,
    counted: { start: "2026-08-01", end: "2026-11-08" },
    dataThrough: "2026-10-01",
    partialPeriod: "2026-10-01",
  };

  it("names the partial month in place of the data-through line", () => {
    const lines = captionLines(partial, 1);
    expect(lines[2]).toBe(
      "XDMoD has data through Oct 1, 2026, so Oct 2026 may be partial.",
    );
    expect(lines.join("\n")).not.toContain("has data through Oct 1, 2026.");
  });

  it("names the period at the chart's unit", () => {
    const line = (unit: string) => captionLines({ ...partial, unit }, 1)[2];
    expect(line("Day")).toBe(
      "XDMoD has data through Oct 1, 2026, so Oct 1, 2026 may be partial.",
    );
    expect(line("Quarter")).toBe(
      "XDMoD has data through Oct 1, 2026, so Q4 2026 may be partial.",
    );
    expect(line("Year")).toBe(
      "XDMoD has data through Oct 1, 2026, so 2026 may be partial.",
    );
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
      "XDMoD link,https://xdmod.access-ci.org/#chart",
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
      dimension: "Resource",
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
      "XDMoD link,https://xdmod.access-ci.org/#chart",
      "",
      "Resource,CPU Hours: Total",
      '"The ""big"" one",50',
      "Small,",
    ]);
  });

  it("leaves out the link when there is none", () => {
    expect(chartCsv(lineView({ link: null }))).not.toContain("XDMoD link");
  });

  it("adds where the data stops to the header", () => {
    const view = lineView({
      caption: {
        ...lineView().caption,
        dataThrough: "2026-09-01",
        dataThroughPrecision: "day",
      },
    });
    expect(chartCsv(view).split("\n").slice(1, 3)).toEqual([
      "Counted,2026-08-01 to 2026-10-31",
      "Data through,2026-09-01",
    ]);
  });

  it("names the period for a period-precision end, and only before the range ends", () => {
    const caption = {
      ...lineView().caption,
      dataThrough: "2026-09-01",
      dataThroughPrecision: "period" as const,
    };
    expect(
      chartCsv(lineView({ caption: { ...caption, noDataAfter: true } }))
        .split("\n")
        .slice(2, 3),
    ).toEqual(["No data after,Sep 2026"]);
    expect(chartCsv(lineView({ caption }))).not.toMatch(
      /No data after|Data through/,
    );
    expect(
      chartCsv(
        lineView({
          caption: {
            ...caption,
            dataThrough: "2026-10-31",
            dataThroughPrecision: "day",
          },
        }),
      ),
    ).not.toContain("Data through");
  });

  it("keeps a name that looks like a formula as text", () => {
    const view = lineView({
      kind: "bar-ranked",
      series: [],
      dimension: "Resource",
      bars: [
        { name: "=HYPERLINK(1)", value: -5 },
        { name: "+1", value: 1 },
        { name: "-x", value: 1 },
        { name: "@me", value: 1 },
      ],
      caption: CAPTION,
    });
    expect(chartCsv(view).split("\n").slice(-4)).toEqual([
      "'=HYPERLINK(1),-5",
      "'+1,1",
      "'-x,1",
      "'@me,1",
    ]);
  });
});

describe("chartCsv with the newer facts", () => {
  it("adds early ends and the ranks shown to the header", () => {
    const view = lineView({
      caption: {
        ...lineView().caption,
        offset: 3,
        earlyEnds: [
          { name: "Anvil, Purdue", through: "2026-10-19", precision: "day" },
          { name: "Delta", through: "2026-09-01", precision: "period" },
        ],
      },
    });
    expect(chartCsv(view).split("\n").slice(2, 6)).toEqual([
      '"Data through (Anvil, Purdue)",2026-10-19',
      "No data after (Delta),Sep 2026",
      "Filters,Resource is Delta or Anvil",
      "Ranks,4 to 5",
    ]);
    expect(
      chartCsv(
        lineView({
          caption: { ...view.caption, ordered: true, earlyEnds: [] },
        }),
      ),
    ).toContain("Ranks,4 to 5 by value");
  });
});

describe("chartCsv with a partial period", () => {
  it("adds the partial period after the data-through row", () => {
    const view = lineView({
      caption: {
        ...lineView().caption,
        dataThrough: "2026-10-01",
        partialPeriod: "2026-10-01",
      },
    });
    expect(chartCsv(view).split("\n").slice(1, 4)).toEqual([
      "Counted,2026-08-01 to 2026-10-31",
      "Data through,2026-10-01",
      "Partial period,Oct 2026",
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
        // 6px a character: the legend text fits 400 - 2*16 - 18 = 350px.
        {
          name: "Expanse GPU at " + "x".repeat(50) + " SDSC",
          color: "#1baf7a",
        },
      ],
      shown: 2,
    });

    expect(ctx.drawImage).toHaveBeenCalledOnce();
    expect(drawn).toContain("Delta");
    // A long series name wraps instead of running off the image.
    expect(drawn).toContain("Expanse GPU at");
    expect(drawn).toContain(`${"x".repeat(50)} SDSC`);
    expect(drawn).toContain("Source: XDMoD, retrieved Nov 9, 2026");
    expect(drawn.join(" ")).toContain("Aug 1, 2026 to Oct 31, 2026, by month");
    expect(clicks).toEqual([{ download: "my-chart.png", href: "blob:png" }]);
  });
});
