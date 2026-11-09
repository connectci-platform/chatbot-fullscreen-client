import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ArtifactContent, ArtifactTitle } from "./artifact";

/** The side panel's title, which names the panel as a landmark. */
const TITLE_ID = "side-panel-title";

const composer = () => document.querySelector<HTMLElement>("form textarea");

/**
 * The side panel the chart, software comparison and registration panels draw
 * into: a landmark named by its title, closed by its button or Escape.
 * Closing hands focus back to the control that had it when the panel opened,
 * else to `fallbackFocus` (the composer).
 */
export function SidePanel({
  open,
  onClose,
  fallbackFocus = composer,
}: {
  open: boolean;
  onClose: () => void;
  fallbackFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    opener.current =
      active instanceof HTMLElement &&
      active !== document.body &&
      !ref.current?.contains(active)
        ? active
        : null;
  }, [open]);

  const close = () => {
    const target = opener.current?.isConnected
      ? opener.current
      : fallbackFocus();
    opener.current = null;
    onClose();
    target?.focus();
  };

  return (
    <aside
      ref={ref}
      aria-labelledby={TITLE_ID}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          close();
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
            onClick={close}
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
