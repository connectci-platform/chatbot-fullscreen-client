import type { Message } from "@langchain/langgraph-sdk";

const CHART_TOOL = "get_chart_data";
const MAX_FOLLOW_UPS = 3;
/** The palette's size and the server's default limit: more lines can't be told apart. */
export const MAX_SERIES = 10;

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
    /** Set only when this series' data stops before the chart's. */
    data_through?: string;
    data_through_precision?: "day" | "period";
    data_through_source?: "resource" | "series";
  }[];
  /** A bar's data_through is its last day, set only when before the chart's end. */
  categories?: {
    name: string;
    value: number | null;
    data_through?: string;
    data_through_source?: "resource" | "series";
  }[];
  has_more: boolean;
  /** How many top-ranked ones XDMoD skipped before these; absent from older payloads. */
  offset?: number;
  /** How many XDMoD left out past the limit; null when it didn't say. */
  others_count?: number | null;
  /** Where XDMoD's data stops; absent from older payloads. */
  data_through?: string | null;
  /** "day": data_through is the last day with data. "period": only the start of the last period with data. */
  data_through_precision?: "day" | "period" | null;
  /** XDMoD's data likely covers only part of the data_through period. */
  last_data_period_partial?: boolean;
  ranked_by: "value";
  /** Null for a filtered chart: XDMoD's portal link can't carry filters. */
  link?: string | null;
  source: "XDMoD";
  retrieved: string;
}

export type CaptionWarning =
  "waiting-not-counted" | "not-comparable-across-resources" | "mean-of-jobs";

/** A series or bar whose data stops before the rest of the chart's. */
export type EarlyEnd = {
  name: string;
  through: string;
  /** "day": the last day with data. "period": the start of the last period with data. */
  precision: "day" | "period";
  /**
   * "resource": XDMoD has no data from that resource after it. "series":
   * only nothing recorded for this series, for reasons unknown.
   */
  source: "resource" | "series";
};

export type CaptionFacts = {
  measure: string;
  definition: string;
  counted: { start: string; end: string };
  /** Where XDMoD's data stops, when it says. */
  dataThrough?: string;
  /**
   * "day" (the default): dataThrough is the last day with data. "period":
   * only the start of the last period with data, which may be full.
   */
  dataThroughPrecision?: "day" | "period";
  /** The counted range has periods after the dataThrough one, all empty. */
  noDataAfter?: boolean;
  /** The data_through period, when XDMoD's data likely covers only part of it. */
  partialPeriod?: string;
  unit?: string;
  filters: string[];
  /** More series or bars than the chart draws. */
  hasMore: boolean;
  /** How many there are in all, when known. */
  total?: number;
  /** How many top-ranked ones come before the first shown. */
  offset?: number;
  /** Shown series or bars whose data stops before the chart's. */
  earlyEnds?: EarlyEnd[];
  /** What they are, plural: "resources", "fields of science", "groups". */
  groupNoun?: string;
  /** The dimension is ordered buckets (job size), not a ranking. */
  ordered?: boolean;
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
  /** An https link into XDMoD, or null when there is none to offer. */
  link: string | null;
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
const isOptionalString = (v: unknown) => v === undefined || isString(v);
const isSource = (v: unknown) =>
  v === undefined || v === "resource" || v === "series";
const isSeries = (s: unknown): s is NonNullable<ChartPayload["series"]>[0] =>
  isRecord(s) &&
  isString(s.name) &&
  isList(s.points, isPoint) &&
  isOptionalString(s.data_through) &&
  (s.data_through_precision === undefined ||
    s.data_through_precision === "day" ||
    s.data_through_precision === "period") &&
  isSource(s.data_through_source);
const isCategory = (
  c: unknown,
): c is NonNullable<ChartPayload["categories"]>[0] =>
  isRecord(c) &&
  isString(c.name) &&
  isValue(c.value) &&
  isOptionalString(c.data_through) &&
  isSource(c.data_through_source);
const isCount = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === "number" && Number.isInteger(v) && v >= 0);

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
  if (raw.link !== undefined && raw.link !== null && !isString(raw.link)) {
    return null;
  }
  if (
    raw.data_through !== undefined &&
    raw.data_through !== null &&
    !isString(raw.data_through)
  ) {
    return null;
  }
  if (
    raw.data_through_precision !== undefined &&
    raw.data_through_precision !== null &&
    raw.data_through_precision !== "day" &&
    raw.data_through_precision !== "period"
  ) {
    return null;
  }
  if (!isCount(raw.others_count) || !isCount(raw.offset)) return null;
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

type Parsed = { chart: ChartPayload; worthy: boolean } | null;

/**
 * Parsed payloads by tool message. A streamed token replaces only the message
 * it belongs to, so every other message object, and its parse, carries over.
 */
const parsed = new WeakMap<Message, Parsed>();

/** The chart-worthy payload on a get_chart_data result, or null for anything else. */
function chartOf(message: Message): ChartPayload | null {
  if (message.type !== "tool" || message.name !== CHART_TOOL) return null;
  let hit = parsed.get(message);
  if (hit === undefined) {
    const artifact = (message as { artifact?: unknown }).artifact;
    const content = isRecord(artifact) ? artifact.structured_content : null;
    const chart = isRecord(content) ? parsePayload(content.chart) : null;
    hit = chart && { chart, worthy: isChartWorthy(chart) };
    parsed.set(message, hit);
  }
  return hit?.worthy ? hit.chart : null;
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

const DIMENSION_NOUNS: Record<string, string> = {
  resource: "resources",
  resource_type: "resource types",
  fieldofscience: "fields of science",
  parentscience: "parent sciences",
  nsfdirectorate: "NSF directorates",
  queue: "queues",
  person: "users",
  username: "users",
  pi: "PIs",
  institution: "institutions",
  provider: "service providers",
  allocation: "allocations",
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

const CPU_HOUR_STATISTICS: ReadonlySet<string> = new Set([
  "total_cpu_hours",
  "avg_cpu_hours",
]);

function warningsFor(chart: ChartPayload): CaptionWarning[] {
  const warnings: CaptionWarning[] = [];
  const { statistic, realm } = chart;
  if (realm.toLowerCase() === "jobs" && chart.last_period_incomplete) {
    warnings.push("waiting-not-counted");
  }
  // XDMoD's definitions: XD SUs "have been normalized ... Therefore they are
  // comparable across resources", and ACEs allow comparison between resources
  // with different compute power per core, which CPU hours don't.
  if (
    (chart.group_by === "resource" || chart.dimension.name === "resource") &&
    CPU_HOUR_STATISTICS.has(statistic)
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

function earlyEnd(
  name: string,
  through: string | undefined,
  precision: "day" | "period" | undefined,
  source: "resource" | "series" | undefined,
): EarlyEnd | undefined {
  // Without a source, nothing is known about why: say the least.
  return through
    ? {
        name,
        through,
        precision: precision ?? "day",
        source: source ?? "series",
      }
    : undefined;
}

function toView(
  key: string,
  messageId: string,
  chart: ChartPayload,
): ChartView {
  const zero = chart.measure.missing === "zero";
  const fill = (v: Value): Value => (v === null && zero ? 0 : v);
  // Past the last period XDMoD has data for, missing means unknown, not
  // zero: filling it would draw a drop that didn't happen.
  const through = chart.data_through;
  const fillPoint = (p: { start: string; value: Value }): Value =>
    through && p.start.slice(0, 10) > through ? p.value : fill(p.value);

  let kind: ChartView["kind"];
  let series: ChartView["series"] = [];
  let bars: ChartView["bars"] = [];
  let arrived: number;
  let earlyEnds: EarlyEnd[];
  if (chart.dataset_type === "timeseries") {
    kind = "line";
    // A series that stops before the others stops there too: its own last
    // value, not the chart's, ends what can be read as zero.
    const filled = (chart.series ?? []).flatMap((s) => {
      const last = s.points.findLastIndex((p) => p.value !== null);
      if (last === -1) return [];
      return [
        {
          name: s.name,
          points: s.points.map((p, i) => ({
            start: p.start,
            value: i > last ? p.value : fillPoint(p),
          })),
          end: earlyEnd(
            s.name,
            s.data_through,
            s.data_through_precision,
            s.data_through_source,
          ),
        },
      ];
    });
    arrived = filled.length;
    const drawn = filled.slice(0, MAX_SERIES);
    series = drawn.map(({ name, points }) => ({ name, points }));
    earlyEnds = drawn.flatMap((s) => (s.end ? [s.end] : []));
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
    arrived = bars.length;
    earlyEnds = (chart.categories ?? []).flatMap(
      (c) =>
        earlyEnd(c.name, c.data_through, "day", c.data_through_source) ?? [],
    );
  }

  const shown = kind === "line" ? series.length : bars.length;
  const offset = chart.offset ?? 0;
  const others = chart.has_more ? chart.others_count : 0;
  const total =
    others === null || others === undefined
      ? undefined
      : offset + arrived + others;
  const precision =
    chart.data_through_precision ??
    (chart.dataset_type === "aggregate" || chart.unit === "Day"
      ? "day"
      : "period");
  const noDataAfter =
    !!through &&
    (chart.series ?? []).some((s) =>
      s.points.some((p) => p.start.slice(0, 10) > through),
    );

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
      ...(chart.data_through
        ? {
            dataThrough: chart.data_through,
            dataThroughPrecision: precision,
            noDataAfter,
          }
        : {}),
      ...(chart.data_through && chart.last_data_period_partial
        ? { partialPeriod: chart.data_through }
        : {}),
      unit: chart.unit,
      filters: [...chart.filters.notes],
      hasMore: chart.has_more || shown < arrived,
      ...(total !== undefined ? { total } : {}),
      ...(offset > 0 ? { offset } : {}),
      ...(earlyEnds.length > 0 ? { earlyEnds } : {}),
      groupNoun:
        DIMENSION_NOUNS[chart.dimension.name.toLowerCase()] ?? "groups",
      ordered: chart.dimension.ordered,
      incomplete: chart.last_period_incomplete,
      warnings,
      source: chart.source,
      retrieved: chart.retrieved,
    },
    // The payload crossed a network boundary: only a web link is followed.
    link: chart.link?.startsWith("https:") ? chart.link : null,
    followUps: followUpsFor(chart, kind, warnings),
  };
}

/**
 * Views by tool message and the AI message they sit under, so the same
 * message gives back the same view object and a memoized chart doesn't redraw.
 */
const viewCache = new WeakMap<Message, Map<string, ChartView>>();

function cachedView(
  source: Message,
  key: string,
  messageId: string,
  chart: ChartPayload,
): ChartView {
  let byMessage = viewCache.get(source);
  if (!byMessage) {
    byMessage = new Map();
    viewCache.set(source, byMessage);
  }
  let view = byMessage.get(messageId);
  if (!view) {
    view = toView(key, messageId, chart);
    byMessage.set(messageId, view);
  }
  return view;
}

/**
 * Every chart-worthy get_chart_data result of each assistant turn (the
 * messages after a human message up to the next one), in tool-call order, so
 * when the model charts the answer and some context in parallel the answer
 * comes first. Keyed by the turn's final AI message; a turn still streaming is
 * keyed by the last AI message so far. Read from tool results the
 * conversation already holds, so charts come back when a thread is reopened.
 */
export function chartViewsByMessage(
  messages: Message[],
): Map<string, ChartView[]> {
  const views = new Map<string, ChartView[]>();
  let turn: Message[] = [];

  const flush = () => {
    let messageId: string | undefined;
    const callOrder = new Map<string, number>();
    const found: { source: Message; key: string; chart: ChartPayload }[] = [];
    for (const m of turn) {
      if (m.type === "ai") {
        if (m.id) messageId = m.id;
        for (const call of m.tool_calls ?? []) {
          if (call.id && !callOrder.has(call.id)) {
            callOrder.set(call.id, callOrder.size);
          }
        }
      }
      const chart = chartOf(m);
      if (chart && m.type === "tool") {
        found.push({ source: m, key: m.tool_call_id, chart });
      }
    }
    if (found.length && messageId) {
      const order = (key: string) => callOrder.get(key) ?? Infinity;
      const id = messageId;
      views.set(
        id,
        found
          .map((f, i) => ({ f, i }))
          .sort((a, b) => order(a.f.key) - order(b.f.key) || a.i - b.i)
          .map(({ f }) => cachedView(f.source, f.key, id, f.chart)),
      );
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

/** The charts from the newest turn that has any, in tool-call order. */
export function latestChartViews(messages: Message[]): ChartView[] {
  let latest: ChartView[] = [];
  for (const views of chartViewsByMessage(messages).values()) latest = views;
  return latest;
}
