"use client";

import { type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";

/**
 * Asks before something that can't be undone. The confirm button names the
 * action, and Cancel takes focus first, so Enter alone never confirms.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  busy,
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  /** Where focus goes on close, when the button that opened it is gone. */
  onCloseAutoFocus?: (event: Event) => void;
}): ReactNode {
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          role="alertdialog"
          aria-busy={busy}
          onCloseAutoFocus={onCloseAutoFocus}
          className="bg-background fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-[10px] p-6 shadow-lg"
        >
          <DialogPrimitive.Title className="text-lg font-bold">
            {title}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm break-words">
            {description}
          </DialogPrimitive.Description>
          {/* The buttons are disabled while it works, so say so. */}
          <p
            role="status"
            className="sr-only"
          >
            {busy ? "Deleting…" : ""}
          </p>
          <div className="flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                autoFocus
              >
                Cancel
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={onConfirm}
            >
              {busy ? "Deleting…" : confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
