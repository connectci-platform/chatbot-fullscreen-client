import type { ReactNode } from "react";
import { program } from "@/config/program";

/**
 * The line under the message box. `controls` go at its left (the
 * conversation buttons, while the top bar is out of view). The line is one
 * 16px row of text where it fits, and the controls fit in it without making
 * it taller.
 *
 * The program's droppable sentence shows only where the line is at least
 * 26rem wide: below that, the rest of the disclaimer and the buttons beside
 * it would wrap onto one more line than the whole disclaimer did alone.
 * It's the line's width that decides, not whether the buttons are showing,
 * so the words don't change as the conversation scrolls. Below 19rem the
 * rest still takes two lines beside the buttons, so the line keeps two
 * lines' height without them too.
 */
export function ChatDisclaimer({
  controls,
}: {
  controls?: ReactNode;
}): ReactNode {
  const { droppable, text } = program.disclaimer;
  return (
    <div className="@container/disclaimer mt-1.5 flex items-center gap-2">
      {controls}
      {/* Two lines where the buttons would push it onto a second one, so
          the message box doesn't move when they come and go. */}
      <p className="text-muted-foreground min-h-8 min-w-0 flex-1 text-center text-[11px] leading-4 @min-[19rem]/disclaimer:min-h-0">
        {droppable && (
          <span className="hidden @min-[26rem]/disclaimer:inline">
            {droppable}{" "}
          </span>
        )}
        <span>{text}</span>{" "}
        <a
          href={program.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Notice
        </a>
      </p>
    </div>
  );
}
