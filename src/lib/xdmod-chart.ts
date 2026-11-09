import type { Message } from "@langchain/langgraph-sdk";

const CHART_TOOL = "get_chart_data";
const MAX_FOLLOW_UPS = 3;

type Json = Record<string, unknown>;
type Unit = "Day" | "Month" | "Quarter" | "Year";
type Period = { start: string; end: string };

/**
 * The XDMoD server's chart payload, version 1, as access-mcp defines it
 * (packages/xdmod/src/chart-payload.ts). It crosses a network boundary, so
 * `parsePayload` checks it before anything here trusts it.
 */
interface ChartPayload {
  version: 1;
  realm: string;
  statistic: string;
  group_by: string;
  dataset_type: "timeseries" | "aggregate";
  unit?: Unit;
  requested: Period;
  counted: Period;
  last_period_incomplete: boolean;
  measure: {
    label: string;
    description: string;
    kind: "total" | "average";
    missing: "zero" | "gap";
  };
  dimension: { name: string; ordered: boolean };
  filters: { notes: string[] };
  series?: {
    name: string;
    points: { start: string; value: number | null }[];
  }[];
  categories?: { name: string; value: number | null }[];
  has_more: boolean;
  /** Start of the last period with any value; absent from older payloads. */
  data_through?: string | null;
  /** XDMoD's data likely covers only part of the data_through period. */
  last_data_period_partial?: boolean;
  ranked_by: "value";
  link: string;
  source: "XDMoD";
  retrieved: string;
}

export type CaptionWarning =
  "waiting-not-counted" | "not-comparable-across-resources" | "mean-of-jobs";

export type CaptionFacts = {
  measure: string;
  definition: string;
  counted: { start: string; end: string };
  /** Start of the last period XDMoD has any data for, when it says. */
  dataThrough?: string;
  /** The data_through period, when XDMoD's data likely covers only part of it. */
  partialPeriod?: string;
  unit?: string;
  filters: string[];
  hasMore: boolean;
  incomplete: boolean;
  warnings: CaptionWarning[];
  source: string;
  retrieved: string;
};

type Value = number | null;

export type ChartView = {
  /** The get_chart_data tool call this came from. */
  key: string;
  /** The AI message that answered the turn; the chart belongs under it. */
  messageId: string;
  kind: "line" | "bar-ranked" | "bar-ordered";
  title: string;
  /** What the bars are, readable: "Resource", "Field of science". */
  dimension: string;
  series: { name: string; points: { start: string; value: Value }[] }[];
  bars: { name: string; value: Value }[];
  caption: CaptionFacts;
  link: string;
  followUps: string[];
};

function isRecord(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const isString = (v: unknown): v is string => typeof v === "string";
const isValue = (v: unknown): v is Value =>
  v === null || (typeof v === "number" && Number.isFinite(v));

function isPeriod(v: unknown): v is Period {
  return isRecord(v) && isString(v.start) && isString(v.end);
}

function isList<T>(v: unknown, check: (item: unknown) => item is T): v is T[] {
  return Array.isArray(v) && v.every(check);
}

const isPoint = (p: unknown): p is { start: string; value: Value } =>
  isRecord(p) && isString(p.start) && isValue(p.value);
const isSeries = (s: unknown): s is NonNullable<ChartPayload["series"]>[0] =>
  isRecord(s) && isString(s.name) && isList(s.points, isPoint);
const isCategory = (c: unknown): c is { name: string; value: Value } =>
  isRecord(c) && isString(c.name) && isValue(c.value);

function parsePayload(raw: unknown): ChartPayload | null {
  if (!isRecord(raw) || raw.version !== 1) return null;
  const { measure, dimension, filters } = raw;
  if (
    !isString(raw.realm) ||
    !isString(raw.statistic) ||
    !isString(raw.group_by) ||
    (raw.dataset_type !== "timeseries" && raw.dataset_type !== "aggregate") ||
    !isPeriod(raw.requested) ||
    !isPeriod(raw.counted) ||
    typeof raw.last_period_incomplete !== "boolean" ||
    typeof raw.has_more !== "boolean" ||
    !isString(raw.link) ||
    !isString(raw.source) ||
    !isString(raw.retrieved)
  ) {
    return null;
  }
  if (
    !isRecord(measure) ||
    !isString(measure.label) ||
    !isString(measure.description) ||
    (measure.kind !== "total" && measure.kind !== "average") ||
    (measure.missing !== "zero" && measure.missing !== "gap")
  ) {
    return null;
  }
  if (
    !isRecord(dimension) ||
    !isString(dimension.name) ||
    typeof dimension.ordered !== "boolean"
  ) {
    return null;
  }
  if (!isRecord(filters) || !isList(filters.notes, isString)) return null;
  if (raw.unit !== undefined && !isString(raw.unit)) return null;
  if (
    raw.data_through !== undefined &&
    raw.data_through !== null &&
    !isString(raw.data_through)
  ) {
    return null;
  }
  if (
    raw.last_data_period_partial !== undefined &&
    typeof raw.last_data_period_partial !== "boolean"
  ) {
    return null;
  }
  if (raw.series !== undefined && !isList(raw.series, isSeries)) return null;
  if (raw.categories !== undefined && !isList(raw.categories, isCategory)) {
    return null;
  }
  return raw as unknown as ChartPayload;
}

/** The payload on a get_chart_data result, or null for anything else. */
function chartOf(message: Message): ChartPayload | null {
  if (message.type !== "tool" || message.name !== CHART_TOOL) return null;
  const artifact = (message as { artifact?: unknown }).artifact;
  if (!isRecord(artifact) || !isRecord(artifact.structured_content)) {
    return null;
  }
  return parsePayload(artifact.structured_content.chart);
}

function isChartWorthy(chart: ChartPayload): boolean {
  if (chart.dataset_type === "aggregate") {
    return (chart.categories?.length ?? 0) > 1;
  }
  let nonNull = 0;
  for (const s of chart.series ?? []) {
    for (const p of s.points) if (p.value !== null) nonNull++;
  }
  return nonNull > 1;
}

const DIMENSION_LABELS: Record<string, string> = {
  none: "Name",
  resource: "Resource",
  resource_type: "Resource type",
  fieldofscience: "Field of science",
  parentscience: "Parent science",
  nsfdirectorate: "NSF directorate",
  jobsize: "Job size",
  jobwalltime: "Job wall time",
  jobwaittime: "Job wait time",
  queue: "Queue",
  person: "User",
  username: "User",
  pi: "PI",
  institution: "Institution",
  provider: "Service provider",
  allocation: "Allocation",
  gpucount: "GPU count",
};

/** A readable column name for an XDMoD dimension id. */
function dimensionLabel(name: string): string {
  const known = DIMENSION_LABELS[name.toLowerCase()];
  if (known) return known;
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function warningsFor(chart: ChartPayload): CaptionWarning[] {
  const warnings: CaptionWarning[] = [];
  const { statistic, realm } = chart;
  if (realm.toLowerCase() === "jobs" && chart.last_period_incomplete) {
    warnings.push("waiting-not-counted");
  }
  if (
    (chart.group_by === "resource" || chart.dimension.name === "resource") &&
    (statistic === "total_cpu_hours" || statistic === "total_su")
  ) {
    warnings.push("not-comparable-across-resources");
  }
  if (statistic.startsWith("avg_")) warnings.push("mean-of-jobs");
  return warnings;
}

function followUpsFor(
  chart: ChartPayload,
  kind: ChartView["kind"],
  warnings: CaptionWarning[],
): string[] {
  const out: string[] = [];
  if (chart.unit === "Day") out.push("Show this by month instead");
  const oneSeries = kind === "line" && chart.series?.length === 1;
  const oneResource =
    chart.group_by !== "resource" &&
    chart.filters.notes.some((n) => /\bresource\b/i.test(n));
  if (oneSeries || oneResource) {
    out.push(
      warnings.includes("not-comparable-across-resources")
        ? "Compare this across resources using ACEs"
        : "Compare this across resources",
    );
  }
  if (chart.statistic.includes("waitduration")) {
    out.push("Show wait time by job size");
  }
  if (chart.realm.toLowerCase() === "jobs" && chart.group_by !== "jobsize") {
    out.push("Show the job-size mix for this period");
  }
  return out.slice(0, MAX_FOLLOW_UPS);
}

function toView(
  key: string,
  messageId: string,
  chart: ChartPayload,
): ChartView {
  const zero = chart.measure.missing === "zero";
  const fill = (v: Value): Value => (v === null && zero ? 0 : v);

  let kind: ChartView["kind"];
  let series: ChartView["series"] = [];
  let bars: ChartView["bars"] = [];
  if (chart.dataset_type === "timeseries") {
    kind = "line";
    series = (chart.series ?? []).map((s) => ({
      name: s.name,
      points: s.points.map((p) => ({ start: p.start, value: fill(p.value) })),
    }));
  } else {
    bars = (chart.categories ?? []).map((c) => ({
      name: c.name,
      value: fill(c.value),
    }));
    if (chart.dimension.ordered) {
      kind = "bar-ordered";
    } else {
      kind = "bar-ranked";
      bars = bars
        .map((b, i) => ({ b, i }))
        .sort((x, y) => {
          if (x.b.value === null || y.b.value === null) {
            return x.b.value === y.b.value
              ? x.i - y.i
              : x.b.value === null
                ? 1
                : -1;
          }
          return y.b.value - x.b.value || x.i - y.i;
        })
        .map(({ b }) => b);
    }
  }

  const warnings = warningsFor(chart);
  return {
    key,
    messageId,
    kind,
    title: chart.measure.label,
    dimension: dimensionLabel(chart.dimension.name),
    series,
    bars,
    caption: {
      measure: chart.measure.label,
      definition: chart.measure.description,
      counted: { ...chart.counted },
      ...(chart.data_through ? { dataThrough: chart.data_through } : {}),
      ...(chart.data_through && chart.last_data_period_partial
        ? { partialPeriod: chart.data_through }
        : {}),
      unit: chart.unit,
      filters: [...chart.filters.notes],
      hasMore: chart.has_more,
      incomplete: chart.last_period_incomplete,
      warnings,
      source: chart.source,
      retrieved: chart.retrieved,
    },
    link: chart.link,
    followUps: followUpsFor(chart, kind, warnings),
  };
}

/**
 * One chart per assistant turn (the messages after a human message up to the
 * next one): the turn's last chart-worthy get_chart_data result, keyed by the
 * turn's final AI message. A turn still streaming is keyed by the last AI
 * message so far. Read from tool results the conversation already holds, so
 * charts come back when a thread is reopened.
 */
export function chartViewsByMessage(
  messages: Message[],
): Map<string, ChartView> {
  const views = new Map<string, ChartView>();
  let turn: Message[] = [];

  const flush = () => {
    let messageId: string | undefined;
    let found: { key: string; chart: ChartPayload } | null = null;
    for (const m of turn) {
      if (m.type === "ai" && m.id) messageId = m.id;
      const chart = chartOf(m);
      if (chart && isChartWorthy(chart) && m.type === "tool") {
        found = { key: m.tool_call_id, chart };
      }
    }
    if (found && messageId) {
      views.set(messageId, toView(found.key, messageId, found.chart));
    }
    turn = [];
  };

  for (const m of messages) {
    if (m.type === "human") flush();
    else turn.push(m);
  }
  flush();
  return views;
}

/** The chart from the newest turn that has one. */
export function latestChartView(messages: Message[]): ChartView | null {
  let latest: ChartView | null = null;
  for (const view of chartViewsByMessage(messages).values()) latest = view;
  return latest;
}
