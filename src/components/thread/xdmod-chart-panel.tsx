"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  chartFileName,
  downloadChartCsv,
  downloadChartPng,
  shownCount,
} from "@/lib/chart-export";
import { newestPanelStep } from "@/lib/software-comparison";
import { cn } from "@/lib/utils";
import { chartViewsByMessage, type ChartView } from "@/lib/xdmod-chart";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact } from "./artifact";
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
  busy,
  onAsk,
}: {
  view: ChartView;
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
      });
    } catch {
      toast.error("Couldn't save the chart image. Try the CSV instead.");
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 sm:p-6">
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
        questions={view.followUps}
        onAsk={onAsk}
        disabled={busy}
        compact
        className="ml-4"
      />
    </div>
  );
}

/**
 * Opens the side panel on the newest XDMoD chart in the conversation, or on
 * an earlier one picked with `showChart`.
 */
export function XdmodChartPanel({ onAsk }: { onAsk: (text: string) => void }) {
  const stream = useStreamContext();
  const views = useMemo(
    () => [...chartViewsByMessage(stream.messages).values()],
    [stream.messages],
  );
  const latest = views.at(-1) ?? null;
  const latestKey = latest?.key ?? null;

  // A picked chart holds only until a newer chart arrives.
  const [picked, setPicked] = useState<{
    key: string;
    latestKey: string | null;
  } | null>(null);
  const view =
    (picked?.latestKey === latestKey &&
      views.find((v) => v.key === picked.key)) ||
    latest;

  const [Artifact, { open, setOpen }] = useArtifact();
  const owns = useMemo(
    () => newestPanelStep(stream.messages) === "chart",
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

  useEffect(() => {
    const onShow = (event: Event) => {
      setPicked({ key: (event as CustomEvent<string>).detail, latestKey });
      setOpen(true);
    };
    window.addEventListener(SHOW_CHART, onShow);
    return () => window.removeEventListener(SHOW_CHART, onShow);
  }, [latestKey, setOpen]);

  if (!view) return null;
  return (
    <Artifact title={view.title}>
      {/* Keyed by the tool call, which stays put while the answer streams,
          so the chart and the Chart/Table choice survive it. */}
      <ChartBody
        key={view.key}
        view={view}
        busy={stream.isLoading}
        onAsk={onAsk}
      />
    </Artifact>
  );
}
