"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { SettingsIcon, XIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { toast } from "sonner";
import { program } from "@/config/program";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import { useStreamContext } from "@/providers/Stream";
import {
  loadConsent,
  saveConsent,
  usePersonalization,
} from "@/lib/personalization";

export const PERSONALIZATION_DESCRIPTION =
  "Let the assistant use your profile and account information to tailor its answers, such as your name, institution, academic status, and the resources you have access to with your login on each.";

/** On or off for a signed-in user's personalized answers. */
export function PersonalizationSwitch(): ReactNode {
  const { apiUrl } = useStreamContext();
  const [threadId] = useQueryState("threadId");
  const { consent, allowedOnce } = usePersonalization();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConsent(apiUrl).finally(() => setLoaded(true));
  }, [apiUrl]);

  const on = consent === "allow";
  const toggle = () => {
    setSaving(true);
    saveConsent(apiUrl, on ? "deny" : "allow")
      .then((saved) =>
        toast.success(
          saved === "allow"
            ? "Personalized answers are on."
            : "Personalized answers are off.",
        ),
      )
      .catch(() =>
        toast.error("Couldn't save this setting. Try again.", {
          closeButton: true,
        }),
      )
      .finally(() => setSaving(false));
  };

  const unavailable = loaded && consent === null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span
            id="personalized-answers-label"
            className="text-[15px] font-semibold"
          >
            Personalized answers
          </span>
          <span
            id="personalized-answers-description"
            className="text-muted-foreground text-[13px]"
          >
            {PERSONALIZATION_DESCRIPTION}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="personalized-answers-label"
          aria-describedby="personalized-answers-description"
          disabled={!loaded || unavailable || saving}
          onClick={toggle}
          className="focus-visible:ring-ring aria-checked:bg-brand relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`inline-block size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      {consent === "unset" && !!threadId && allowedOnce.includes(threadId) && (
        <p className="text-muted-foreground text-[13px]">
          On for this conversation only.
        </p>
      )}
      {unavailable && (
        <p
          role="status"
          className="text-sm"
        >
          {"Couldn't load this setting. "}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setLoaded(false);
              loadConsent(apiUrl).finally(() => setLoaded(true));
            }}
          >
            Try again
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * The Settings row above the sidebar's footer links, signed in only. It opens
 * the Settings dialog.
 */
export function SettingsButton(): ReactNode {
  const signedIn = useAuthStatus() === "signed_in";
  const [open, setOpen] = useState(false);
  if (!signedIn) return null;
  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={setOpen}
    >
      <div className="w-full px-3 py-2">
        <DialogPrimitive.Trigger className="hover:bg-accent focus-visible:ring-ring flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-[15px] font-semibold focus-visible:ring-2 focus-visible:outline-hidden">
          <SettingsIcon
            aria-hidden
            className="size-[22px]"
          />
          Settings
        </DialogPrimitive.Trigger>
      </div>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="bg-background fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-[560px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[10px] p-6 shadow-lg">
          <div className="flex items-center gap-3">
            <SettingsIcon
              aria-hidden
              className="text-brand size-[22px] shrink-0"
            />
            <DialogPrimitive.Title className="flex-1 text-[22px] font-bold">
              Settings
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close settings"
              className="hover:bg-accent focus-visible:ring-ring inline-flex size-11 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-hidden"
            >
              <XIcon
                aria-hidden
                className="size-5"
              />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            Settings for the ACCESS Assistant
          </DialogPrimitive.Description>
          <section
            aria-labelledby="settings-privacy-heading"
            className="flex flex-col gap-3"
          >
            <h3
              id="settings-privacy-heading"
              className="text-muted-foreground text-[13px] font-bold tracking-[0.06em] uppercase"
            >
              Conversations and privacy
            </h3>
            {open && <PersonalizationSwitch />}
            <a
              href={program.privacyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm"
            >
              Privacy Notice
            </a>
          </section>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
