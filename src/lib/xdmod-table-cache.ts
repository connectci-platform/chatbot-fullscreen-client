import type { TableCell } from "./xdmod-table";

/**
 * Rows of the few tables shown most recently, by stored table id, so
 * switching away and back, or downloading after viewing, doesn't fetch them
 * again. Bounded by the chart panel, since each can be 50,000 rows; the
 * oldest is dropped first. A failed fetch is forgotten so Retry asks again.
 */
export const loadedRows = new Map<string, Promise<TableCell[][]>>();

/** Drops every cached table, after a conversation is deleted. */
export function forgetLoadedTables(): void {
  loadedRows.clear();
}
