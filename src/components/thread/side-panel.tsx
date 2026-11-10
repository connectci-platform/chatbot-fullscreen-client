import { XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ArtifactContent, ArtifactTitle } from "./artifact";

/** The side panel's title, which names the panel as a landmark. */
const TITLE_ID = "side-panel-title";

const composer = () => document.querySelector<HTMLElement>("form textarea");

const TEXT_INPUTS = [
  "text",
  "search",
  "email",
  "url",
  "tel",
  "password",
  "number",
];

/** A text field holding something Escape might be meant to clear. */
function isFilledTextField(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return el.value.length > 0;
  if (el instanceof HTMLInputElement) {
    return TEXT_INPUTS.includes(el.type) && el.value.length > 0;
  }
  return el instanceof HTMLElement && el.isContentEditable
    ? (el.textContent ?? "").length > 0
    : false;
}

/** An open dialog or menu, which takes Escape for itself. */
const overlayOpen = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [role="alertdialog"], [role="menu"], dialog[open]',
  );

/**
 * The side panel the chart, software comparison and registration panels draw
 * into: a landmark named by its title, closed by its button or by Escape
 * from anywhere on the page. Escape is left alone when a handler already
 * took it (the rating comment box), in a text field with something in it,
 * and while a dialog or menu is open.
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
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });

  // On the document, so React handlers that take Escape run first.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (isFilledTextField(document.activeElement) || overlayOpen()) return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <aside
      ref={ref}
      aria-labelledby={TITLE_ID}
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
