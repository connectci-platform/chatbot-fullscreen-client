"use client";

import { memo, useState } from "react";
import { formatPeriod } from "@/lib/chart-export";
import { cn } from "@/lib/utils";
import type { TableCell, TableColumn, TableView } from "@/lib/xdmod-table";
import { formatNumber } from "./xdmod-chart";

/** Rows on screen at once. The CSV has all of them; 50,000 table rows would stall the page. */
const PAGE_ROWS = 100;

const ROWS = new Intl.NumberFormat("en-US");

const BUTTON =
  "hover:text-brand focus-visible:ring-brand cursor-pointer border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50 disabled:hover:text-inherit motion-reduce:transition-none";

function formatCell(
  value: TableCell,
  column: TableColumn,
  unit: string | undefined,
): string {
  if (value === null) return "—";
  if (column.kind === "number") return formatNumber(value as number);
  if (column.kind === "period") return formatPeriod(String(value), unit);
  return String(value);
}

/**
 * A get_raw_data table a page at a time, in the chart table's style: the
 * first column heads each row and numbers line up on the right.
 */
export const XdmodDataTable = memo(function XdmodDataTable({
  view,
}: {
  view: TableView;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(view.rows.length / PAGE_ROWS));
  const first = page * PAGE_ROWS;
  const rows = view.rows.slice(first, first + PAGE_ROWS);
  const cell = "border-b px-3 py-2 text-right tabular-nums";
  const head = "border-b px-3 py-2 text-left align-bottom";
  const right = (c: TableColumn) => c.kind === "number";

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <div
        role="region"
        aria-label="Data table"
        tabIndex={0}
        className="max-w-full shrink-0 overflow-x-auto border"
      >
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{view.title}</caption>
          <thead>
            <tr>
              {view.columns.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className={cn(head, right(c) && "text-right")}
                >
                  {c.kind === "period" ? (view.unit ?? c.name) : c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={first + r}>
                {row.map((value, i) => {
                  const column = view.columns[i];
                  const text = formatCell(value, column, view.unit);
                  return i === 0 ? (
                    <th
                      key={i}
                      scope="row"
                      className={cn(
                        head,
                        "font-normal",
                        column.kind === "period" && "whitespace-nowrap",
                        right(column) && "text-right tabular-nums",
                      )}
                    >
                      {text}
                    </th>
                  ) : (
                    <td
                      key={i}
                      className={right(column) ? cell : cn(head, "align-top")}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button
            type="button"
            className={BUTTON}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={page === pages - 1}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
          <p
            className="text-muted-foreground"
            aria-live="polite"
          >
            Rows {ROWS.format(first + 1)} to {ROWS.format(first + rows.length)}{" "}
            of {ROWS.format(view.rows.length)}
          </p>
        </div>
      )}
    </div>
  );
});
