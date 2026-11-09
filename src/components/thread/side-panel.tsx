import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ArtifactContent, ArtifactTitle } from "./artifact";

/** The side panel's title, which names the panel as a landmark. */
const TITLE_ID = "side-panel-title";

/**
 * The side panel the chart, software comparison and registration panels draw
 * into: a landmark named by its title, closed by its button or Escape.
 */
export function SidePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      aria-labelledby={TITLE_ID}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          onClose();
        }
      }}
      className={cn("relative flex flex-col border-l", !open && "hidden")}
    >
      <div className="absolute inset-0 flex min-w-[30vw] flex-col">
        <div className="grid grid-cols-[1fr_auto] border-b p-4">
          <ArtifactTitle
            id={TITLE_ID}
            className="truncate overflow-hidden"
          />
          <button
            onClick={onClose}
            aria-label="Close panel"
            className="cursor-pointer"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        <ArtifactContent className="relative min-h-0 flex-grow overflow-hidden" />
      </div>
    </aside>
  );
}
