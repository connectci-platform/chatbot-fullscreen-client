"use client";

import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { captionLines, formatDay, parseDay, periods } from "@/lib/chart-export";
import type { ChartView } from "@/lib/xdmod-chart";

/**
 * Categorical series colors, checked with the dataviz skill's palette
 * validator (light mode, white surface): every adjacent pair stays apart under
 * color-blind simulation. Slots 3-5 sit under 3:1 against white, so the chart
 * always has a legend and a table view. The colors are literal, not CSS
 * variables, because the PNG download draws the SVG on its own.
 */
const SERIES_COLORS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#6250d6",
  "#e34948",
  "#00879e",
  "#9e5a1c",
];

// Text and chrome stay in neutral ink, never a series color.
const TEXT = "#0b0b0b";
const MUTED = "#52514e";
const GRID = "#e5e5e5";
const AXIS = "#d4d4d4";
const TICK = { fill: MUTED, fontSize: 12 };

/** Narrow enough for a phone, used until the panel's width is known. */
const FALLBACK_WIDTH = 340;
const LINE_HEIGHT = 260;
const LABEL_CHARS = 18;

/**
 * Each series' color, by name in sorted order, so a resource keeps its color
 * however XDMoD ranks it.
 */
function seriesColors(names: string[]): Map<string, string> {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  return new Map(
    sorted.map((name, i) => [name, SERIES_COLORS[i % SERIES_COLORS.length]]),
  );
}

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : NUMBER.format(value);
}

/** A period's start date, named at the chart's unit: "Aug 2026", "Q3 2026". */
function formatPeriod(start: string, unit?: string): string {
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

const shortLabel = (s: string) =>
  s.length > LABEL_CHARS ? `${s.slice(0, LABEL_CHARS - 1)}…` : s;

/** The width of the element, following it as the panel resizes. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry.contentRect.width)),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width || FALLBACK_WIDTH] as const;
}

type Row = Record<string, string | number | null>;
const solidKey = (i: number) => `s${i}`;
const dashedKey = (i: number) => `d${i}`;

/**
 * One row per period. When the last period is still running, each series'
 * last segment moves to a second, dashed key: the solid line stops at the
 * second-to-last point and the dashed one runs from there to the last.
 */
function lineRows(view: ChartView): { rows: Row[]; dashed: boolean } {
  const starts = periods(view);
  const last = starts.length - 1;
  const dashed = view.caption.incomplete && starts.length >= 2;
  const rows = starts.map((start, p) => {
    const row: Row = { start };
    view.series.forEach((s, i) => {
      const value = s.points[p]?.value ?? null;
      row[solidKey(i)] = dashed && p === last ? null : value;
      if (dashed) row[dashedKey(i)] = p >= last - 1 ? value : null;
    });
    return row;
  });
  return { rows, dashed };
}

/** Points with no neighbor on either side, which a line alone can't show. */
function isolatedPoints(rows: Row[], key: string): Set<number> {
  const has = (i: number) => rows[i]?.[key] != null;
  const out = new Set<number>();
  rows.forEach((_, i) => {
    if (has(i) && !has(i - 1) && !has(i + 1)) out.add(i);
  });
  return out;
}

function ChartTooltip({
  active,
  payload,
  label,
  periodLabel,
}: {
  active?: boolean;
  payload?: readonly { name?: unknown; value?: unknown; color?: string }[];
  label?: unknown;
  periodLabel: (label: string) => string;
}) {
  if (!active || !payload?.length) return null;
  // The dashed copy of a series repeats its value at the shared point.
  const seen = new Set<string>();
  const entries = payload.filter((entry) => {
    const name = String(entry.name);
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
  return (
    <div
      className="border bg-white px-3 py-2 text-xs shadow-sm"
      style={{ color: TEXT }}
    >
      <p className="mb-1 font-semibold">{periodLabel(String(label))}</p>
      <ul className="flex flex-col gap-0.5">
        {entries.map((entry) => (
          <li
            key={String(entry.name)}
            className="flex items-center gap-2"
          >
            <span
              aria-hidden
              className="inline-block h-0.5 w-3"
              style={{ background: entry.color }}
            />
            <span>{String(entry.name)}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums">
              {formatValue(
                typeof entry.value === "number" ? entry.value : null,
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ticksFor(values: (number | null)[]) {
  const max = Math.max(0, ...values.map((v) => v ?? 0));
  return (v: number) => (max >= 10_000 ? COMPACT.format(v) : NUMBER.format(v));
}

function TimeChart({ view, width }: { view: ChartView; width: number }) {
  const { rows, dashed } = lineRows(view);
  const colors = seriesColors(view.series.map((s) => s.name));
  const unit = view.caption.unit;
  const tickValue = ticksFor(
    view.series.flatMap((s) => s.points.map((p) => p.value)),
  );
  return (
    <LineChart
      width={width}
      height={LINE_HEIGHT}
      data={rows}
      margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
    >
      <CartesianGrid
        vertical={false}
        stroke={GRID}
      />
      <XAxis
        dataKey="start"
        tickFormatter={(s: string) => formatPeriod(s, unit)}
        tick={TICK}
        tickLine={false}
        axisLine={{ stroke: AXIS }}
        minTickGap={16}
        interval="preserveStartEnd"
      />
      <YAxis
        tickFormatter={tickValue}
        tick={TICK}
        tickLine={false}
        axisLine={false}
        width={64}
        label={{
          value: view.title,
          angle: -90,
          position: "insideLeft",
          style: { fill: MUTED, fontSize: 12, textAnchor: "middle" },
        }}
      />
      <Tooltip
        content={(props) => (
          <ChartTooltip
            active={props.active}
            payload={props.payload}
            label={props.label}
            periodLabel={(s) =>
              unit === "Day" || !unit ? formatDay(s) : formatPeriod(s, unit)
            }
          />
        )}
        cursor={{ stroke: AXIS }}
      />
      {view.series.flatMap((s, i) => {
        const color = colors.get(s.name)!;
        const isolated = isolatedPoints(rows, solidKey(i));
        const lines = [
          <Line
            key={solidKey(i)}
            dataKey={solidKey(i)}
            name={s.name}
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            connectNulls={false}
            isAnimationActive={false}
            activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }}
            dot={(props: { cx?: number; cy?: number; index?: number }) =>
              props.index !== undefined && isolated.has(props.index) ? (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
          />,
        ];
        if (dashed) {
          lines.push(
            <Line
              key={dashedKey(i)}
              dataKey={dashedKey(i)}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              strokeDasharray="4 4"
              strokeLinecap="round"
              connectNulls={false}
              isAnimationActive={false}
              dot={false}
              activeDot={false}
            />,
          );
        }
        return lines;
      })}
    </LineChart>
  );
}

function BarsChart({ view, width }: { view: ChartView; width: number }) {
  const across = view.kind === "bar-ranked";
  const tickValue = ticksFor(view.bars.map((b) => b.value));
  const color = SERIES_COLORS[0];
  const tooltip = (
    <Tooltip
      content={(props) => (
        <ChartTooltip
          active={props.active}
          payload={props.payload}
          label={props.label}
          periodLabel={(s) => s}
        />
      )}
      cursor={{ fill: "#f4f4f4" }}
    />
  );
  const bar = (
    <Bar
      dataKey="value"
      name={view.title}
      fill={color}
      maxBarSize={24}
      radius={across ? [0, 4, 4, 0] : [4, 4, 0, 0]}
      isAnimationActive={false}
    />
  );
  const measureLabel = {
    value: view.title,
    style: { fill: MUTED, fontSize: 12, textAnchor: "middle" as const },
  };

  if (across) {
    return (
      <BarChart
        layout="vertical"
        width={width}
        height={Math.max(160, view.bars.length * 32 + 56)}
        data={view.bars}
        margin={{ top: 8, right: 16, bottom: 16, left: 8 }}
      >
        <CartesianGrid
          horizontal={false}
          stroke={GRID}
        />
        <XAxis
          type="number"
          tickFormatter={tickValue}
          tick={TICK}
          tickLine={false}
          axisLine={false}
          label={{ ...measureLabel, position: "insideBottom", offset: -8 }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tickFormatter={shortLabel}
          tick={TICK}
          tickLine={false}
          axisLine={{ stroke: AXIS }}
          width={Math.min(150, Math.max(60, longest(view) * 7.5 + 8))}
          interval={0}
        />
        {tooltip}
        {bar}
      </BarChart>
    );
  }
  return (
    <BarChart
      width={width}
      height={LINE_HEIGHT}
      data={view.bars}
      margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
    >
      <CartesianGrid
        vertical={false}
        stroke={GRID}
      />
      <XAxis
        dataKey="name"
        tickFormatter={shortLabel}
        tick={TICK}
        tickLine={false}
        axisLine={{ stroke: AXIS }}
      />
      <YAxis
        tickFormatter={tickValue}
        tick={TICK}
        tickLine={false}
        axisLine={false}
        width={64}
        label={{ ...measureLabel, angle: -90, position: "insideLeft" }}
      />
      {tooltip}
      {bar}
    </BarChart>
  );
}

const longest = (view: ChartView) =>
  Math.min(LABEL_CHARS, Math.max(0, ...view.bars.map((b) => b.name.length)));

/** The legend entries a chart draws, in the view's order. */
export function chartLegend(view: ChartView) {
  if (view.kind !== "line" || view.series.length < 2) return [];
  const colors = seriesColors(view.series.map((s) => s.name));
  return view.series.map((s) => ({ name: s.name, color: colors.get(s.name)! }));
}

/** The chart, sized to its container, with a legend for two or more series. */
export function XdmodChart({ view }: { view: ChartView }): ReactElement {
  const [ref, width] = useWidth();
  const legend = chartLegend(view);
  return (
    <div
      ref={ref}
      className="w-full min-w-0"
    >
      {legend.length > 0 && (
        <ul
          aria-label="Legend"
          className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm"
        >
          {legend.map((entry) => (
            <li
              key={entry.name}
              className="flex items-center gap-2"
            >
              <span
                aria-hidden
                className="inline-block h-0.5 w-4"
                style={{ background: entry.color }}
              />
              {entry.name}
            </li>
          ))}
        </ul>
      )}
      {view.kind === "line" ? (
        <TimeChart
          view={view}
          width={width}
        />
      ) : (
        <BarsChart
          view={view}
          width={width}
        />
      )}
    </div>
  );
}

/** What the chart counts and its caveats, in the same words as the PNG. */
export function ChartCaption({
  view,
  shown,
}: {
  view: ChartView;
  shown: number;
}) {
  const lines = captionLines(view.caption, shown);
  const source = lines.pop();
  return (
    <div className="flex flex-col gap-1 text-sm">
      {lines.map((line, i) => (
        <p
          key={line}
          className={i === 0 ? undefined : "text-muted-foreground"}
        >
          {line}
        </p>
      ))}
      <p className="text-muted-foreground">
        <span>{source}</span>{" "}
        <a
          href={view.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in XDMoD
        </a>
      </p>
    </div>
  );
}

/** The chart's numbers, one row per period or bar. */
export function ChartTable({ view }: { view: ChartView }) {
  const cell = "border-b px-3 py-2 text-right tabular-nums";
  const head = "border-b px-3 py-2 text-left align-bottom";
  return (
    <div
      role="region"
      aria-label="Chart data"
      tabIndex={0}
      className="max-w-full overflow-x-auto border"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{view.title}</caption>
        {view.kind === "line" ? (
          <>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={head}
                >
                  {view.caption.unit ?? "Period"}
                </th>
                {view.series.map((s) => (
                  <th
                    key={s.name}
                    scope="col"
                    className={`${head} text-right`}
                  >
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods(view).map((start, p) => (
                <tr key={start}>
                  <th
                    scope="row"
                    className={`${head} font-normal whitespace-nowrap`}
                  >
                    {formatPeriod(start, view.caption.unit)}
                  </th>
                  {view.series.map((s) => (
                    <td
                      key={s.name}
                      className={cell}
                    >
                      {formatValue(s.points[p]?.value)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </>
        ) : (
          <>
            <thead>
              <tr>
                <th
                  scope="col"
                  className={head}
                >
                  Name
                </th>
                <th
                  scope="col"
                  className={`${head} text-right`}
                >
                  {view.title}
                </th>
              </tr>
            </thead>
            <tbody>
              {view.bars.map((bar) => (
                <tr key={bar.name}>
                  <th
                    scope="row"
                    className={`${head} font-normal`}
                  >
                    {bar.name}
                  </th>
                  <td className={cell}>{formatValue(bar.value)}</td>
                </tr>
              ))}
            </tbody>
          </>
        )}
      </table>
    </div>
  );
}
