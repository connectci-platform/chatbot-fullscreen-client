"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { program } from "@/config/program";
import { useAuthStatus } from "@/hooks/use-agent-auth";
import { useStreamContext } from "@/providers/Stream";
import {
  loadConsent,
  saveConsent,
  usePersonalization,
} from "@/lib/personalization";

export const PERSONALIZATION_DESCRIPTION =
  "Let the assistant use your ACCESS profile (name, institution, academic status) and your allocation and account information (which resources you have and your login on each) to tailor its answers.";

/** On or off for a signed-in user's personalized answers. */
export function PersonalizationSwitch(): ReactNode {
  const { apiUrl } = useStreamContext();
  const { consent } = usePersonalization();
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
        <span
          id="personalized-answers-label"
          className="text-sm font-medium"
        >
          Personalized answers
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="personalized-answers-label"
          aria-describedby="personalized-answers-description"
          disabled={!loaded || unavailable || saving}
          onClick={toggle}
          className="focus-visible:ring-ring aria-checked:bg-brand relative inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-300 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:opacity-50"
        >
          <span
            aria-hidden
            className={`inline-block size-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`}
          />
        </button>
      </div>
      <p
        id="personalized-answers-description"
        className="text-muted-foreground text-sm"
      >
        {PERSONALIZATION_DESCRIPTION}{" "}
        <a
          href={program.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Notice
        </a>
      </p>
      {unavailable && (
        <p
          role="status"
          className="text-sm"
        >
          Couldn&apos;t load this setting.{" "}
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

/** The Settings button at the bottom of the conversations list, signed in only. */
export function SettingsButton(): ReactNode {
  const signedIn = useAuthStatus() === "signed_in";
  const [open, setOpen] = useState(false);
  if (!signedIn) return null;
  return (
    <>
      <Button
        variant="ghost"
        className="min-h-11 w-full justify-start gap-2 rounded-none border-t px-4 font-normal"
        onClick={() => setOpen(true)}
      >
        <SettingsIcon aria-hidden />
        Settings
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
      >
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription className="sr-only">
              Settings for the ACCESS Assistant
            </SheetDescription>
          </SheetHeader>
          {open && (
            <div className="px-4">
              <PersonalizationSwitch />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
