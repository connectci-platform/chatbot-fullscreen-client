"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import {
  chartLabels,
  chartViewsByMessage,
  latestAnswerHasChart,
  type ChartView,
} from "@/lib/xdmod-chart";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact, useArtifactOpen } from "./artifact";
import { SuggestedQuestions } from "./suggested-questions";
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

/** Picks between the charts one answer drew, by what tells them apart. */
function ChartSwitcher({
  views,
  labels,
  selected,
  onSelect,
}: {
  views: ChartView[];
  labels: Map<string, string>;
  selected: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Charts in this answer"
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
 * Opens the side panel on the newest answer's charts, or on an earlier
 * answer's picked with `showChart`. An answer that drew several charts shows
 * its first (the model's first call, the answer to the question) with a
 * switcher for the rest.
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
    () => [...chartViewsByMessage(stream.messages).values()],
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
  const questions = getSuggestedQuestions(
    stream.messages.find((m) => m.id === answerId),
  );
  const labels = chartLabels(turn ?? []);

  const [Artifact, { open, setOpen }] = useArtifact();
  const [anyOpen] = useArtifactOpen();
  // Opens only for the newest answer's own chart: a reloaded thread whose
  // newest answer drew none keeps an older chart closed.
  const owns = useMemo(
    () =>
      newestPanelStep(stream.messages) === "chart" &&
      latestAnswerHasChart(stream.messages),
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
        <ChartBody
          key={view.key}
          view={view}
          questions={questions}
          label={labels.get(view.key) ?? view.title}
          busy={stream.isLoading || awaitingCheck}
          onAsk={onAsk}
        />
      </div>
    </Artifact>
  );
}
