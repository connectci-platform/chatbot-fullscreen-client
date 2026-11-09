import type { CaptionFacts, CaptionWarning, ChartView } from "./xdmod-chart";

const WARNING_TEXT: Record<CaptionWarning, string> = {
  "waiting-not-counted":
    "Jobs still waiting aren't counted, and the last few days may be incomplete.",
  "not-comparable-across-resources":
    "CPU hours and SUs aren't comparable across resources. ACE measures are.",
  "mean-of-jobs":
    "This is an average per job, so a few long jobs can pull it up.",
};

const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/** A UTC date, so "2026-08-01" stays Aug 1 wherever the reader is. */
export function parseDay(iso: string): Date | null {
  const m = DAY.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** "2026-08-01" as "Aug 1, 2026". Anything else comes back unchanged. */
export function formatDay(iso: string): string {
  const day = parseDay(iso);
  if (!day) return iso;
  return day.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** A period's start date, named at the chart's unit: "Aug 2026", "Q3 2026". */
export function formatPeriod(start: string, unit?: string): string {
  const day = parseDay(start);
  if (!day) return start;
  const year = day.getUTCFullYear();
  switch (unit) {
    case "Year":
      return String(year);
    case "Quarter":
      return `Q${Math.floor(day.getUTCMonth() / 3) + 1} ${year}`;
    case "Month":
      return day.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
    default:
      return formatDay(start);
  }
}

/**
 * Where XDMoD's data stops, as far as the caption can honestly say. A day
 * is said when it's before the counted end. A period start is not a day the
 * data stops (the period may be full), so it's said only as "no data after"
 * that period, and only when later periods in the range are empty.
 */
function dataEnd(
  caption: CaptionFacts,
): { day: string } | { period: string } | null {
  const through = caption.dataThrough;
  if (!through) return null;
  if ((caption.dataThroughPrecision ?? "day") === "day") {
    return through < caption.counted.end ? { day: through } : null;
  }
  return caption.noDataAfter
    ? { period: formatPeriod(through, caption.unit) }
    : null;
}

/** How many of how many the chart shows, or null when it shows them all. */
function shownLine(caption: CaptionFacts, shown: number): string | null {
  if (!caption.hasMore) return null;
  if (caption.total === undefined) {
    return `Showing the top ${shown}; XDMoD has more.`;
  }
  return caption.ordered
    ? `Showing ${shown} of ${caption.total} buckets.`
    : `Showing the top ${shown} of ${caption.total} ${caption.groupNoun ?? "groups"}.`;
}

/**
 * The caption under a chart, one line per fact, in reading order. The panel
 * and the PNG both draw these, so they always say the same thing. `shown` is
 * how many series or bars the chart draws.
 */
export function captionLines(caption: CaptionFacts, shown: number): string[] {
  const range = `${formatDay(caption.counted.start)} to ${formatDay(caption.counted.end)}`;
  const lines = [
    `${caption.measure}: ${caption.definition}`,
    caption.unit ? `${range}, by ${caption.unit.toLowerCase()}` : range,
  ];
  // XDMoD's public data often stops weeks before the range does.
  const end = dataEnd(caption);
  if (end) {
    const lead =
      "day" in end
        ? `XDMoD has data through ${formatDay(end.day)}`
        : `XDMoD has no data after ${end.period}`;
    lines.push(
      caption.partialPeriod
        ? `${lead}, so ${formatPeriod(caption.partialPeriod, caption.unit)} may be partial.`
        : `${lead}.`,
    );
  }
  if (caption.filters.length > 0) {
    lines.push(`Filtered to ${caption.filters.join("; ")}`);
  }
  const showing = shownLine(caption, shown);
  if (showing) lines.push(showing);
  if (caption.incomplete) {
    lines.push(
      caption.unit
        ? "The last period is still in progress."
        : "The range runs to today, so it's still in progress.",
    );
  }
  for (const warning of caption.warnings) lines.push(WARNING_TEXT[warning]);
  lines.push(
    `Source: ${caption.source}, retrieved ${formatDay(caption.retrieved)}`,
  );
  return lines;
}

/** How many series or bars a view draws. */
export function shownCount(view: ChartView): number {
  return view.kind === "line" ? view.series.length : view.bars.length;
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  // A spreadsheet runs a text cell that starts like a formula; names come
  // from XDMoD, so they're kept as text. Numbers stay numbers.
  const text =
    typeof value === "string" && /^[=+\-@\t\r]/.test(value)
      ? `'${value}`
      : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRow = (cells: (string | number | null)[]) =>
  cells.map(csvCell).join(",");

/**
 * The chart's numbers as CSV: what was counted first, so the file still
 * makes sense on its own, then one row per period or bar. Missing values are
 * empty cells.
 */
export function chartCsv(view: ChartView): string {
  const { caption } = view;
  const end = dataEnd(caption);
  const rows: (string | number | null)[][] = [
    ["Measure", caption.measure],
    ["Counted", `${caption.counted.start} to ${caption.counted.end}`],
    ...(end
      ? [
          ("day" in end
            ? ["Data through", end.day]
            : ["No data after", end.period]) as [string, string],
        ]
      : []),
    ...(caption.partialPeriod
      ? [
          [
            "Partial period",
            formatPeriod(caption.partialPeriod, caption.unit),
          ] as [string, string],
        ]
      : []),
    ["Filters", caption.filters.length ? caption.filters.join("; ") : "None"],
    ["Retrieved", caption.retrieved],
    ["Source", caption.source],
  ];
  const lines = rows.map(csvRow);
  lines.push("");
  if (view.kind === "line") {
    lines.push(csvRow(["Period", ...view.series.map((s) => s.name)]));
    for (const [i, start] of periods(view).entries()) {
      lines.push(
        csvRow([start, ...view.series.map((s) => s.points[i]?.value ?? null)]),
      );
    }
  } else {
    lines.push(csvRow([view.dimension, caption.measure]));
    for (const bar of view.bars) lines.push(csvRow([bar.name, bar.value]));
  }
  return lines.join("\n");
}

/**
 * The periods of a line chart, from its longest series. XDMoD gives every
 * series the same periods, so they line up by index.
 */
export function periods(view: ChartView): string[] {
  let longest: string[] = [];
  for (const s of view.series) {
    if (s.points.length > longest.length) {
      longest = s.points.map((p) => p.start);
    }
  }
  return longest;
}

/**
 * The index of the period that contains `day`: the last one starting on or
 * before it. XDMoD's data_through can fall mid-period (Oct 19 in a monthly
 * chart), so an exact match on period starts would miss it. -1 if `day` is
 * before the first period.
 */
export function periodContaining(starts: string[], day: string): number {
  const target = day.slice(0, 10);
  let found = -1;
  starts.forEach((start, i) => {
    if (start.slice(0, 10) <= target) found = i;
  });
  return found;
}

/** A file name (no extension) from the measure and the counted range. */
export function chartFileName(view: ChartView): string {
  const slug = view.caption.measure
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const { start, end } = view.caption.counted;
  return `xdmod-${slug}-${start}-to-${end}`;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  // Let the click start the download before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadChartCsv(view: ChartView): void {
  saveBlob(
    new Blob([chartCsv(view)], { type: "text/csv;charset=utf-8" }),
    `${chartFileName(view)}.csv`,
  );
}

/** Greedy word wrap; a word wider than the line gets a line of its own. */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't draw the chart image"));
    img.src = src;
  });
}

export type LegendEntry = { name: string; color: string };

const SCALE = 2;
const PAD = 16;
const FONT = "Archivo, Arial, Helvetica, sans-serif";
const TEXT = "#0b0b0b";
const MUTED = "#52514e";
const CAPTION_SIZE = 12;
const CAPTION_LINE = 17;
const LEGEND_LINE = 20;
const LEGEND_FONT = `13px ${FONT}`;
const LEGEND_INDENT = 18;

/**
 * Saves the chart as a PNG with its legend and caption, so the picture
 * carries its own context when it's pasted somewhere else. The chart's SVG is
 * drawn as an image, so its colors must be literal (no CSS variables).
 */
export async function downloadChartPng(
  svg: SVGSVGElement,
  caption: CaptionFacts,
  fileName: string,
  { legend = [], shown = 1 }: { legend?: LegendEntry[]; shown?: number } = {},
): Promise<void> {
  const width =
    Number(svg.getAttribute("width")) || svg.getBoundingClientRect().width;
  const height =
    Number(svg.getAttribute("height")) || svg.getBoundingClientRect().height;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("font-family", FONT);
  const markup = new XMLSerializer().serializeToString(clone);
  const img = await loadImage(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`,
  );

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't draw the chart image");

  const textWidth = width - PAD * 2;
  ctx.font = `${CAPTION_SIZE}px ${FONT}`;
  const lines = captionLines(caption, shown).flatMap((line) =>
    wrapText(line, textWidth, (s) => ctx.measureText(s).width),
  );
  ctx.font = LEGEND_FONT;
  const legendLines = (legend.length > 1 ? legend : []).map((entry) => ({
    color: entry.color,
    lines: wrapText(
      entry.name,
      textWidth - LEGEND_INDENT,
      (s) => ctx.measureText(s).width,
    ),
  }));
  const legendHeight =
    legendLines.reduce((n, entry) => n + entry.lines.length, 0) * LEGEND_LINE;
  const total =
    PAD + legendHeight + height + PAD / 2 + lines.length * CAPTION_LINE + PAD;

  canvas.width = width * SCALE;
  canvas.height = total * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, total);
  ctx.textBaseline = "top";

  let y = PAD;
  ctx.font = LEGEND_FONT;
  for (const entry of legendLines) {
    ctx.fillStyle = entry.color;
    ctx.fillRect(PAD, y + 5, 12, 3);
    ctx.fillStyle = TEXT;
    for (const line of entry.lines) {
      ctx.fillText(line, PAD + LEGEND_INDENT, y);
      y += LEGEND_LINE;
    }
  }
  ctx.drawImage(img, 0, y, width, height);
  y += height + PAD / 2;

  ctx.font = `${CAPTION_SIZE}px ${FONT}`;
  ctx.fillStyle = MUTED;
  for (const line of lines) {
    ctx.fillText(line, PAD, y);
    y += CAPTION_LINE;
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Couldn't save the chart image");
  saveBlob(blob, `${fileName}.png`);
}
