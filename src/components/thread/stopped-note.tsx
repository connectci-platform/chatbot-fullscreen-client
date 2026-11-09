import type { Ref } from "react";
import { cutOffNote, type StopReason } from "@/lib/stopped-answer";
import { Button } from "../ui/button";

/**
 * The note under a question that has no answer, with a way to ask it again.
 * It stays mounted so the live region exists before the note appears in it,
 * which is what lets screen readers announce it; `contents` keeps the empty
 * region from adding a gap to the thread.
 */
export function StoppedNote({
  turn,
  onRetry,
  onEdit,
  retryRef,
}: {
  /** Null while there's nothing to show. */
  turn: { stoppedHere: boolean; reason: StopReason } | null;
  onRetry: () => void;
  onEdit: () => void;
  /** Retry, so focus can move to it when Cancel goes away. */
  retryRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <div
      aria-live="polite"
      className="contents"
    >
      {turn && (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p className="text-muted-foreground">
            {turn.stoppedHere
              ? cutOffNote(turn.reason)
              : "This question didn't get an answer."}
          </p>
          <div className="flex gap-2">
            <Button
              ref={retryRef}
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
            >
              Retry
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onEdit}
            >
              Edit question
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
