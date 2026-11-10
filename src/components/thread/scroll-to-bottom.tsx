import { ArrowDown } from "lucide-react";
import { Button } from "../ui/button";

/**
 * "Scroll to bottom": a small round button floating just above the message
 * box at its right edge, shown only when the conversation is scrolled up.
 * It takes no room of its own, and at the end of the conversation, where
 * the last lines of an answer are, it isn't there to cover them.
 */
export function ScrollToBottomButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label="Scroll to bottom"
      className="animate-in fade-in-0 zoom-in-95 absolute right-0 bottom-full z-20 mb-2 size-11 rounded-full bg-white shadow-md"
      onClick={onClick}
    >
      <ArrowDown
        aria-hidden
        className="size-5"
      />
    </Button>
  );
}
