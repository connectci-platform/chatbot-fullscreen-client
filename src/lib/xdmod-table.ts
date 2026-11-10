import type { Message } from "@langchain/langgraph-sdk";
import { csvRow, formatDay, saveBlob } from "./chart-export";
import {
  chartViewOf,
  isChartResult,
  resultsByTurn,
  chartLabels,
  type ChartView,
} from "./xdmod-chart";

const TABLE_TOOL = "get_raw_data";

type Json = Record<string, unknown>;

export type TableColumn = { name: string; kind: "period" | "label" | "number" };
export type TableCell = string | number | null;
type Unit = "Day" | "Month" | "Quarter" | "Year";

/**
 * The xdmod-data server's full table, version 1, as access-mcp defines it
 * (packages/xdmod-mcp-data/src/xdmod_mcp_data/raw_table.py): every row of a
 * get_raw_data result, which the model never sees. The agent stores it once
 * per thread (access-agent src/tool_attachments.py) and leaves this reference
 * on the tool message: the table's description without its rows, plus the id
 * its rows are fetched by. It crosses a network boundary, so `parseRef`
 * checks it before anything here trusts it.
 */
interface TableRef {
  id: string;
  kind: "table";
  version: 1;
  source: string;
  realm: string;
  metric: string;
  dimension: string | null;
  dataset_type: string;
  aggregation_unit: string;
  requested: { start: string; end: string };
  filters: Record<string, string[]>;
  columns: TableColumn[];
  row_count: number;
  retrieved: string;
}

export type TableView = {
  kind: "table";
  /** The get_raw_data tool call this came from. */
  key: string;
  /** The AI message that answered the turn; the table belongs under it. */
  messageId: string;
  /** "CPU Hours: Total by User". */
  title: string;
  /** The value column's name: "CPU Hours: Total". */
  measure: string;
  /** The grouping column's name, when there is one: "User". */
  group: string | null;
  columns: TableColumn[];
  /** The stored table's id, which fetches its rows from the agent. */
  id: string;
  /** How many rows the stored table has. */
  rowCount: number;
  /** The period the rows are by, when the table is a timeseries. */
  unit?: Unit;
  requested: { start: string; end: string };
  /** "resource: NCSA DELTA GPU, NCSA DELTA CPU", one per filtered dimension. */
  filters: string[];
  realm: string;
  source: string;
  retrieved: string;
};

/** A chart or a table: what the XDMoD panel shows for an answer. */
export type XdmodItem = ChartView | TableView;

const KINDS: ReadonlySet<string> = new Set(["period", "label", "number"]);
const UNITS: ReadonlySet<string> = new Set(["Day", "Month", "Quarter", "Year"]);

function isRecord(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const isString = (v: unknown): v is string => typeof v === "string";

const isColumn = (c: unknown): c is TableColumn =>
  isRecord(c) && isString(c.name) && isString(c.kind) && KINDS.has(c.kind);

function isFilters(v: unknown): v is Record<string, string[]> {
  return (
    isRecord(v) &&
    Object.values(v).every(
      (names) => Array.isArray(names) && names.every(isString),
    )
  );
}

/** Every row as long as the columns, each cell the type its column holds. */
export function rowsFit(
  rows: unknown,
  columns: TableColumn[],
): rows is TableCell[][] {
  if (!Array.isArray(rows)) return false;
  const numeric = columns.map((c) => c.kind === "number");
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== columns.length) return false;
    for (let i = 0; i < row.length; i++) {
      const cell: unknown = row[i];
      if (numeric[i]) {
        if (
          cell !== null &&
          !(typeof cell === "number" && Number.isFinite(cell))
        ) {
          return false;
        }
      } else if (!isString(cell)) {
        return false;
      }
    }
  }
  return true;
}

function parseRef(raw: unknown): TableRef | null {
  if (!isRecord(raw) || raw.version !== 1 || raw.kind !== "table") return null;
  if (!isString(raw.id) || !/^[0-9a-f]{32}$/.test(raw.id)) return null;
  const { requested, columns } = raw;
  if (
    !isString(raw.source) ||
    !isString(raw.realm) ||
    !isString(raw.metric) ||
    !(raw.dimension === null || isString(raw.dimension)) ||
    !isString(raw.dataset_type) ||
    !isString(raw.aggregation_unit) ||
    !isString(raw.retrieved) ||
    !isRecord(requested) ||
    !isString(requested.start) ||
    !isString(requested.end) ||
    !isFilters(raw.filters)
  ) {
    return null;
  }
  if (
    !Array.isArray(columns) ||
    columns.length === 0 ||
    !columns.every(isColumn)
  ) {
    return null;
  }
  const count = raw.row_count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) {
    return null;
  }
  return raw as unknown as TableRef;
}

/**
 * Parsed tables by tool message. A streamed token replaces only the message
 * it belongs to, so every other message object, and its parse, carries over.
 */
const parsed = new WeakMap<Message, TableRef | null>();

/** The stored table a get_raw_data result refers to, or null for anything else. */
function tableOf(message: Message): TableRef | null {
  if (message.type !== "tool" || message.name !== TABLE_TOOL) return null;
  let hit = parsed.get(message);
  if (hit === undefined) {
    const artifact = (message as { artifact?: unknown }).artifact;
    const content = isRecord(artifact) ? artifact.structured_content : null;
    hit = isRecord(content) ? parseRef(content.table_ref) : null;
    parsed.set(message, hit);
  }
  return hit;
}

function toView(key: string, messageId: string, table: TableRef): TableView {
  const measure = table.columns[table.columns.length - 1].name;
  const group = table.columns.find((c) => c.kind === "label")?.name ?? null;
  const grouped = table.dimension !== null && group !== null;
  return {
    kind: "table",
    key,
    messageId,
    title: grouped ? `${measure} by ${group}` : measure,
    measure,
    group: grouped ? group : null,
    columns: table.columns,
    id: table.id,
    rowCount: table.row_count,
    ...(table.columns.some((c) => c.kind === "period") &&
    UNITS.has(table.aggregation_unit)
      ? { unit: table.aggregation_unit as Unit }
      : {}),
    requested: { ...table.requested },
    filters: Object.entries(table.filters).map(
      ([dimension, names]) => `${dimension}: ${names.join(", ")}`,
    ),
    realm: table.realm,
    source: table.source,
    retrieved: table.retrieved,
  };
}

/** Views by tool message and answer, so the same message gives back the same view. */
const viewCache = new WeakMap<Message, Map<string, TableView>>();

function tableViewOf(source: Message, messageId: string): TableView | null {
  const table = tableOf(source);
  if (!table || source.type !== "tool") return null;
  let byMessage = viewCache.get(source);
  if (!byMessage) {
    byMessage = new Map();
    viewCache.set(source, byMessage);
  }
  let view = byMessage.get(messageId);
  if (!view) {
    view = toView(source.tool_call_id, messageId, table);
    byMessage.set(messageId, view);
  }
  return view;
}

/** Every get_raw_data table of each assistant turn, in tool-call order. */
export function tableViewsByMessage(
  messages: Message[],
): Map<string, TableView[]> {
  const views = new Map<string, TableView[]>();
  for (const [id, found] of resultsByTurn(messages, tableOf)) {
    views.set(
      id,
      found.flatMap((f) => tableViewOf(f.source, id) ?? []),
    );
  }
  return views;
}

const isItem = (m: Message): true | null =>
  isChartResult(m) || tableOf(m) ? true : null;

/**
 * Every chart and table of each assistant turn, together in tool-call order,
 * keyed by the turn's answer. Read from tool results the conversation already
 * holds, so they come back when a thread is reopened.
 */
export function xdmodItemsByMessage(
  messages: Message[],
): Map<string, XdmodItem[]> {
  const items = new Map<string, XdmodItem[]>();
  for (const [id, found] of resultsByTurn(messages, isItem)) {
    items.set(
      id,
      found.flatMap(
        (f) => chartViewOf(f.source, id) ?? tableViewOf(f.source, id) ?? [],
      ),
    );
  }
  return items;
}

/** The charts and tables from the newest turn that has any. */
export function latestXdmodItems(messages: Message[]): XdmodItem[] {
  let latest: XdmodItem[] = [];
  for (const items of xdmodItemsByMessage(messages).values()) latest = items;
  return latest;
}

/**
 * Whether the newest answer (the messages after the last human message) has
 * a chart or a table. A reloaded thread whose newest answer has none
 * shouldn't reopen an older answer's.
 */
export function latestAnswerHasXdmodItem(messages: Message[]): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === "human") return false;
    if (isItem(m)) return true;
  }
  return false;
}

/**
 * The whole table as CSV: a header row of column names, then every stored
 * row, not just the page on screen. Cells are escaped as the chart's
 * CSV escapes them, formula-looking names included.
 */
export function tableCsv(view: TableView, rows: TableCell[][]): string {
  const lines = [csvRow(view.columns.map((c) => c.name))];
  for (const row of rows) lines.push(csvRow(row));
  return lines.join("\n");
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** A file name (no extension) from the title and the requested range. */
export function tableFileName(view: TableView): string {
  const { start, end } = view.requested;
  return `xdmod-${slug(view.title)}-${start}-to-${end}`;
}

export function downloadTableCsv(view: TableView, rows: TableCell[][]): void {
  saveBlob(
    new Blob([tableCsv(view, rows)], { type: "text/csv;charset=utf-8" }),
    `${tableFileName(view)}.csv`,
  );
}

const ROWS = new Intl.NumberFormat("en-US");

/** What the table holds, one line per fact, in reading order. */
export function tableCaptionLines(view: TableView): string[] {
  const lines: string[] = [];
  if (view.filters.length > 0) {
    lines.push(`Filtered to ${view.filters.join("; ")}`);
  }
  const range = `${formatDay(view.requested.start)} to ${formatDay(view.requested.end)}`;
  lines.push(view.unit ? `${range}, by ${view.unit.toLowerCase()}` : range);
  const n = view.rowCount;
  const per = view.unit
    ? view.group
      ? `one per ${view.unit.toLowerCase()} and ${view.group.toLowerCase()}`
      : `one per ${view.unit.toLowerCase()}`
    : view.group
      ? `one per ${view.group.toLowerCase()}`
      : null;
  lines.push(
    `${ROWS.format(n)} ${n === 1 ? "row" : "rows"}${per ? `, ${per}` : ""}. The CSV has every row.`,
  );
  lines.push(`Source: ${view.source}, retrieved ${formatDay(view.retrieved)}`);
  return lines;
}

/**
 * A name for each of one answer's charts and tables that tells them apart.
 * Charts are named as chartLabels names them; a table by its title, marked
 * as a table when the answer has anything else, and numbered when two share
 * a name.
 */
export function itemLabels(items: XdmodItem[]): Map<string, string> {
  const charts = items.filter((v): v is ChartView => v.kind !== "table");
  const labels = chartLabels(charts);
  const tables = items.filter((v): v is TableView => v.kind === "table");
  const name = (t: TableView) =>
    items.length > 1 ? `${t.title} · table` : t.title;
  const seen = new Map<string, number>();
  for (const t of tables) {
    const base = name(t);
    const twins = tables.filter((o) => name(o) === base).length;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    labels.set(t.key, twins > 1 ? `${base} ${n}` : base);
  }
  return labels;
}

/**
 * Fetches a stored table's rows from the agent, on the thread's own access
 * check. Rejects when the request fails or the rows don't fit the reference.
 */
export async function fetchTableRows(
  view: TableView,
  get: (path: string) => Promise<Response>,
): Promise<TableCell[][]> {
  const res = await get(`attachments/${encodeURIComponent(view.id)}`);
  if (!res.ok) throw new Error(`The table failed to load (${res.status})`);
  const body: unknown = await res.json();
  const rows = isRecord(body) ? body.rows : null;
  if (!rowsFit(rows, view.columns) || rows.length !== view.rowCount) {
    throw new Error("The table that came back doesn't match this answer");
  }
  return rows;
}
