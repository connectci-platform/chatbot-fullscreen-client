"use client";

import { Button } from "@/components/ui/button";
import {
  confirmBlock,
  previewDetails,
  previewTitle,
  type ConfirmBlock,
  type Preview,
} from "@/lib/confirm";

/** What the agent has staged, with one Confirm for all of it. */
export function ConfirmCard({
  previews,
  busy,
  onSend,
}: {
  previews: Preview[];
  busy: boolean;
  onSend: (text: string, blocks: ConfirmBlock[]) => void;
}) {
  if (previews.length === 0) return null;
  const ids = previews.map((p) => p.previewId);
  return (
    <section
      aria-label="Changes waiting for your confirmation"
      className="bg-muted flex flex-col gap-4 rounded-md border p-4"
    >
      {previews.map((preview) => {
        const { notes, rows } = previewDetails(preview.data);
        return (
          <div
            key={preview.previewId}
            className="flex flex-col gap-2"
          >
            <h2 className="font-semibold">{previewTitle(preview.tool)}</h2>
            {notes.map((note) => (
              <p
                key={note}
                className="text-sm"
              >
                {note}
              </p>
            ))}
            {rows.length > 0 && (
              <dl className="flex flex-col gap-2 text-sm">
                {rows.map((row, i) => (
                  <div key={`${row.label}-${i}`}>
                    <dt className="font-semibold">{row.label}</dt>
                    <dd className="max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        );
      })}
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy}
          onClick={() => onSend("Confirm", [confirmBlock(ids)])}
        >
          {previews.length > 1 ? "Confirm all" : "Confirm"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onSend("Cancel", [])}
        >
          Cancel
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Nothing changes until you confirm.
      </p>
    </section>
  );
}
