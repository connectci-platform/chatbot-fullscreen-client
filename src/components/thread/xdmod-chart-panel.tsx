"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  chartFileName,
  downloadChartCsv,
  downloadChartPng,
  shownCount,
} from "@/lib/chart-export";
import { newestPanelStep } from "@/lib/software-comparison";
import { getSuggestedQuestions } from "@/lib/suggested-questions";
import { cn } from "@/lib/utils";
import type { ChartView } from "@/lib/xdmod-chart";
import { threadGet } from "@/lib/thread-attachments";
import {
  downloadTableCsv,
  fetchTableRows,
  itemLabels,
  latestAnswerHasXdmodItem,
  tableCaptionLines,
  xdmodItemsByMessage,
  type TableCell,
  type TableView,
  type XdmodItem,
} from "@/lib/xdmod-table";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact, useArtifactOpen } from "./artifact";
import { SuggestedQuestions } from "./suggested-questions";
import { XdmodDataTable } from "./xdmod-data-table";
import {
  ChartCaption,
  ChartTable,
  XdmodChart,
  chartLegend,
} from "./xdmod-chart";

const SHOW_CHART = "xdmod-chart:show";

/** Opens the chart panel on the chart with this key (its tool_call_id). */
export function showChart(key: string): void {
  window.dispatchEvent(new CustomEvent<string>(SHOW_CHART, { detail: key }));
}

const BUTTON =
  "hover:text-brand focus-visible:ring-brand cursor-pointer border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none motion-reduce:transition-none";

function ChartBody({
  view,
  questions,
  label,
  busy,
  onAsk,
}: {
  view: ChartView;
  /** What the answer that drew the chart suggests asking next. */
  questions: string[];
  /** The chart's name, told apart from the answer's other charts. */
  label: string;
  busy: boolean;
  onAsk: (text: string) => void;
}) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const chartRef = useRef<HTMLDivElement>(null);
  const shown = shownCount(view);

  const savePng = async () => {
    const svg = chartRef.current?.querySelector<SVGSVGElement>(
      "svg.recharts-surface",
    );
    if (!svg) return;
    try {
      await downloadChartPng(svg, view.caption, chartFileName(view), {
        legend: chartLegend(view),
        shown,
        title: label,
      });
    } catch {
      toast.error("Couldn't save the chart image. Try the CSV instead.");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <div
        role="group"
        aria-label="Show as"
        className="flex"
      >
        {(["chart", "table"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              BUTTON,
              "-ml-px first:ml-0",
              mode === m && "bg-foreground hover:text-background text-white",
            )}
          >
            {m === "chart" ? "Chart" : "Table"}
          </button>
        ))}
      </div>

      {/* The chart stays mounted under the table so the PNG can still be
          drawn from it. */}
      <div
        ref={chartRef}
        className={cn(mode !== "chart" && "hidden")}
      >
        <XdmodChart view={view} />
      </div>
      {mode === "table" && <ChartTable view={view} />}

      <ChartCaption
        view={view}
        shown={shown}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={savePng}
        >
          Download PNG
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => downloadChartCsv(view)}
        >
          Download CSV
        </button>
      </div>

      <SuggestedQuestions
        heading="Ask next"
        questions={questions}
        onAsk={onAsk}
        disabled={busy}
        compact
        className="ml-4"
      />
    </div>
  );
}

/**
 * Every row of a get_raw_data result, a page at a time, with a CSV of all of
 * them. A table has no chart to switch to.
 */
type Get = (path: string) => Promise<Response>;

/**
 * Rows by stored table id, so switching away and back, or downloading after
 * viewing, doesn't fetch them again. A failed fetch is forgotten so Retry
 * asks again.
 */
const loadedRows = new Map<string, Promise<TableCell[][]>>();

function loadRows(view: TableView, get: Get | null): Promise<TableCell[][]> {
  if (!get) return Promise.reject(new Error("This conversation has no id yet"));
  let rows = loadedRows.get(view.id);
  if (!rows) {
    rows = fetchTableRows(view, get);
    loadedRows.set(view.id, rows);
    rows.catch(() => loadedRows.delete(view.id));
  }
  return rows;
}

type RowsState =
  | { status: "loading" }
  | { status: "ready"; rows: TableCell[][] }
  | { status: "error" };

/** A stored table's rows, fetched when the table is first shown. */
function useTableRows(view: TableView, get: Get | null) {
  const [state, setState] = useState<RowsState>({ status: "loading" });
  const load = useCallback(() => {
    setState({ status: "loading" });
    const rows = loadRows(view, get);
    rows.then(
      (r) => setState({ status: "ready", rows: r }),
      () => setState({ status: "error" }),
    );
    return rows;
  }, [view, get]);
  useEffect(() => {
    let live = true;
    loadRows(view, get).then(
      (rows) => live && setState({ status: "ready", rows }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [view, get]);
  return { state, load };
}

function TableBody({
  view,
  get,
  questions,
  busy,
  onAsk,
}: {
  view: TableView;
  /** Reads under this conversation on the agent. */
  get: Get | null;
  questions: string[];
  busy: boolean;
  onAsk: (text: string) => void;
}) {
  const lines = tableCaptionLines(view);
  const { state, load } = useTableRows(view, get);
  const download = () => {
    if (state.status === "ready") {
      downloadTableCsv(view, state.rows);
      return;
    }
    load()
      .then((rows) => downloadTableCsv(view, rows))
      .catch(() => {});
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      {state.status === "ready" && (
        <XdmodDataTable
          view={view}
          rows={state.rows}
        />
      )}
      {state.status === "loading" && (
        <p
          role="status"
          className="text-muted-foreground text-sm"
        >
          Loading the table…
        </p>
      )}
      {state.status === "error" && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          <p>The table couldn&apos;t be loaded.</p>
          <button
            type="button"
            className={BUTTON}
            onClick={() => {
              load().catch(() => {});
            }}
          >
            Retry
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm">
        {lines.map((line) => (
          <p
            key={line}
            className="text-muted-foreground"
          >
            {line}
          </p>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={download}
          disabled={state.status === "loading"}
        >
          Download CSV
        </button>
      </div>

      <SuggestedQuestions
        heading="Ask next"
        questions={questions}
        onAsk={onAsk}
        disabled={busy}
        compact
        className="ml-4"
      />
    </div>
  );
}

/** Picks between the charts and tables one answer has, by what tells them apart. */
function ChartSwitcher({
  views,
  labels,
  selected,
  onSelect,
}: {
  views: XdmodItem[];
  labels: Map<string, string>;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={
        views.some((v) => v.kind === "table")
          ? "Charts and tables in this answer"
          : "Charts in this answer"
      }
      className="flex flex-wrap gap-2"
    >
      {views.map((v) => (
        <button
          key={v.key}
          type="button"
          aria-pressed={v.key === selected}
          onClick={() => onSelect(v.key)}
          className={cn(
            BUTTON,
            v.key === selected &&
              "bg-foreground hover:text-background text-white",
          )}
        >
          {labels.get(v.key) ?? v.title}
        </button>
      ))}
    </div>
  );
}

/**
 * Opens the side panel on the newest answer's charts and data tables, or on
 * an earlier answer's picked with `showChart`. An answer that has several
 * shows its first (the model's first call, the answer to the question) with
 * a switcher for the rest.
 */
export function XdmodChartPanel({
  onAsk,
  awaitingCheck = false,
}: {
  onAsk: (text: string) => void;
  /** The Turnstile check is showing: nothing can be sent until it passes. */
  awaitingCheck?: boolean;
}) {
  const stream = useStreamContext();
  const turns = useMemo(
    () => [...xdmodItemsByMessage(stream.messages).values()],
    [stream.messages],
  );
  const latestTurn = turns.at(-1) ?? null;
  // A turn is known by its first chart's tool call, which stays put while
  // the answer streams even though the AI message it sits under moves.
  const latestKey = latestTurn?.[0].key ?? null;

  // A picked answer holds only until a newer chart arrives.
  const [picked, setPicked] = useState<{
    key: string;
    latestKey: string | null;
  } | null>(null);
  const turn =
    (picked?.latestKey === latestKey &&
      turns.find((t) => t.some((v) => v.key === picked.key))) ||
    latestTurn;
  const [selected, setSelected] = useState<string | null>(null);
  const view = turn?.find((v) => v.key === selected) ?? turn?.[0] ?? null;

  const answerId = view?.messageId;
  const { apiUrl, threadId } = stream;
  const get = useMemo(
    () => (apiUrl && threadId ? threadGet(apiUrl, threadId) : null),
    [apiUrl, threadId],
  );
  const questions = getSuggestedQuestions(
    stream.messages.find((m) => m.id === answerId),
  );
  const labels = itemLabels(turn ?? []);

  const [Artifact, { open, setOpen }] = useArtifact();
  const [anyOpen] = useArtifactOpen();
  // Opens only for the newest answer's own chart: a reloaded thread whose
  // newest answer drew none keeps an older chart closed.
  const owns = useMemo(
    () =>
      newestPanelStep(stream.messages) === "chart" &&
      latestAnswerHasXdmodItem(stream.messages),
    [stream.messages],
  );
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (latestKey === shownKey.current) return;
    shownKey.current = latestKey;
    if (latestKey === null) {
      if (open) setOpen(false);
    } else if (owns) {
      setOpen(true);
    }
  }, [latestKey, owns, open, setOpen]);

  // Closing hands focus back to what opened the panel: the Show chart chip
  // that was used, else the chip under the chart's answer.
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const turnKey = turn?.[0].key ?? null;
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    // Another panel took over, so focus stays where it went.
    if (anyOpen) return;
    const chip =
      turnKey !== null
        ? document.querySelector<HTMLElement>(
            `[data-chart-key="${CSS.escape(turnKey)}"]`,
          )
        : null;
    const target = opener.current?.isConnected ? opener.current : chip;
    opener.current = null;
    target?.focus();
  }, [open, anyOpen, turnKey]);

  useEffect(() => {
    const onShow = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      opener.current =
        document.activeElement instanceof HTMLElement &&
        document.activeElement !== document.body
          ? document.activeElement
          : null;
      setPicked({ key, latestKey });
      setSelected(key);
      setOpen(true);
    };
    window.addEventListener(SHOW_CHART, onShow);
    return () => window.removeEventListener(SHOW_CHART, onShow);
  }, [latestKey, setOpen]);

  if (!turn || !view) return null;
  return (
    <Artifact title={labels.get(view.key) ?? view.title}>
      <div className="flex h-full flex-col">
        {/* Outside the keyed body, so switching keeps focus on the button. */}
        {turn.length > 1 && (
          <div className="px-4 pt-4 sm:px-6 sm:pt-6">
            <ChartSwitcher
              views={turn}
              labels={labels}
              selected={view.key}
              onSelect={setSelected}
            />
          </div>
        )}
        {/* Keyed by the tool call, which stays put while the answer streams,
            so the chart and the Chart/Table choice survive it. */}
        {view.kind === "table" ? (
          <TableBody
            key={view.key}
            view={view}
            get={get}
            questions={questions}
            busy={stream.isLoading || awaitingCheck}
            onAsk={onAsk}
          />
        ) : (
          <ChartBody
            key={view.key}
            view={view}
            questions={questions}
            label={labels.get(view.key) ?? view.title}
            busy={stream.isLoading || awaitingCheck}
            onAsk={onAsk}
          />
        )}
      </div>
    </Artifact>
  );
}
