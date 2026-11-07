"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  formatEventTime,
  latestRegistration,
  type Registration,
  type RegistrationStatus,
} from "@/lib/registration";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact } from "./artifact";

const CONFIRM_MESSAGE = "Yes, please confirm.";

function outcomeText(registration: Registration) {
  if (registration.outcome === "waitlist") {
    return {
      title: "This event is full",
      body: "You would join the waitlist.",
      cta: "Join waitlist",
    };
  }
  return {
    title: "A seat is available",
    body: "You get a seat as soon as you confirm.",
    cta: "Confirm registration",
  };
}

const BADGE: Record<RegistrationStatus, string> = {
  preview: "Not registered yet",
  registered: "Registered",
  waitlisted: "Waitlisted",
  already_registered: "Registered",
};

const DONE_TITLE: Record<string, string> = {
  registered: "You are registered",
  waitlisted: "You are on the waitlist",
  already_registered: "You are already registered",
};

export function RegistrationDetails({
  registration,
  busy,
  onConfirm,
  timeZone,
}: {
  registration: Registration;
  busy: boolean;
  onConfirm: () => void;
  timeZone?: string;
}) {
  const { event, status } = registration;
  const isPreview = status === "preview";
  const when = formatEventTime(event?.start, event?.end, timeZone);
  const outcome = outcomeText(registration);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <p
        className={
          isPreview
            ? "w-fit rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900"
            : "w-fit rounded-full bg-teal-100 px-3 py-1 text-sm font-semibold text-teal-900"
        }
      >
        {BADGE[status]}
      </p>

      {event ? (
        <div>
          <h2 className="text-xl font-bold">{event.title}</h2>
          <dl className="mt-3 flex flex-col gap-2 text-sm">
            {when && (
              <div>
                <dt className="font-semibold">When</dt>
                <dd>{when}</dd>
              </div>
            )}
            {event.location && (
              <div>
                <dt className="font-semibold">Where</dt>
                <dd>{event.location}</dd>
              </div>
            )}
          </dl>
        </div>
      ) : (
        <h2 className="text-xl font-bold">Event registration</h2>
      )}

      {isPreview ? (
        <>
          <div className="bg-muted rounded-md border p-4">
            <p className="font-semibold">{outcome.title}</p>
            <p className="text-sm">{outcome.body}</p>
          </div>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="w-full"
          >
            {outcome.cta}
          </Button>
          <p className="text-muted-foreground text-sm">
            Nothing is submitted until you confirm.
          </p>
        </>
      ) : (
        <div
          role="status"
          className="bg-muted rounded-md border p-4"
        >
          <p className="font-semibold">{DONE_TITLE[status]}</p>
          {event?.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline"
            >
              View the event page
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Opens the side panel when the conversation reaches a new registration step. */
export function RegistrationPanel({
  onConfirm,
}: {
  onConfirm: (message: string) => void;
}) {
  const stream = useStreamContext();
  const registration = useMemo(
    () => latestRegistration(stream.messages),
    [stream.messages],
  );
  const [Artifact, { setOpen }] = useArtifact();
  const shownKey = useRef<string | null>(null);

  const key = registration?.key ?? null;
  useEffect(() => {
    if (key !== shownKey.current) {
      shownKey.current = key;
      if (key) setOpen(true);
    }
  }, [key, setOpen]);

  if (!registration) return null;
  return (
    <Artifact title="Event registration">
      <RegistrationDetails
        registration={registration}
        busy={stream.isLoading}
        onConfirm={() => onConfirm(CONFIRM_MESSAGE)}
      />
    </Artifact>
  );
}
