import type { ReactNode } from "react";
import { program } from "@/config/program";

/**
 * The line under the message box. `controls` go at its left (the
 * conversation buttons, while the top bar is out of view). The whole
 * disclaimer always shows, wrapping where it has to.
 *
 * The line is as tall with the buttons as without them, so the message box
 * doesn't move as they come and go. With a mouse they're 24px and sit in
 * the text's 16px rows, and below 26rem the text beside them takes two rows,
 * so the line keeps two rows' height there. On a phone or touch screen
 * they're 44px, and the text beside them can take three 16px rows, so the
 * line keeps 48px there.
 */
export function ChatDisclaimer({
  controls,
}: {
  controls?: ReactNode;
}): ReactNode {
  const { lead, text } = program.disclaimer;
  return (
    <div className="@container/disclaimer mt-1.5 flex items-center gap-2 max-sm:min-h-12 pointer-coarse:min-h-12">
      {controls}
      <p className="text-muted-foreground min-h-8 min-w-0 flex-1 text-center text-[11px] leading-4 @min-[26rem]/disclaimer:min-h-0">
        {lead && <span>{lead} </span>}
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
