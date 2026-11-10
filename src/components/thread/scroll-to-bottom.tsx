import { ArrowDown } from "lucide-react";
import { Button } from "../ui/button";

/**
 * The "Scroll to bottom" button, in a band of its own between the messages
 * and the message box. The band is always there and opaque, so the button
 * never sits on top of answer text and showing it doesn't move anything.
 * A short fade above the band marks that the conversation continues; the
 * message list's bottom padding is at least as tall, so at the end the last
 * line is clear of it.
 */
export function ScrollToBottomSlot({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <div
      data-testid="scroll-to-bottom-slot"
      className="relative flex h-11 w-full shrink-0 items-center justify-center bg-white sm:h-12"
    >
      {visible && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-full h-6 bg-gradient-to-t from-white to-white/0"
          />
          <Button
            variant="outline"
            className="animate-in fade-in-0 zoom-in-95"
            onClick={onClick}
          >
            <ArrowDown className="h-4 w-4" />
            <span>Scroll to bottom</span>
          </Button>
        </>
      )}
    </div>
  );
}
