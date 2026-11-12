"use client";

import { useEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmMessage,
  formatEventTime,
  latestRegistration,
  seatsText,
  type Registration,
  type RegistrationStatus,
} from "@/lib/registration";
import { confirmBlock, type ConfirmBlock } from "@/lib/confirm";
import { newestPanelStep } from "@/lib/software-comparison";
import { useStreamContext } from "@/providers/Stream";
import { useArtifact } from "./artifact";

function outcomeText(registration: Registration) {
  if (registration.outcome === "waitlist") {
    return {
      title: "This event is full",
      body: "You would join the waitlist. The organizer reviews it, and you'll get an email if you're approved.",
      cta: "Join waitlist",
    };
  }
  const body =
    "The organizer reviews each registration. You'll get an email once you're approved.";
  return registration.outcome === "seat"
    ? {
        title: seatsText(registration) ?? "A seat is available",
        body,
        cta: "Confirm registration",
      }
    : { title: "Ready to submit", body, cta: "Confirm registration" };
}

const BADGE: Record<RegistrationStatus, string> = {
  preview: "Not registered yet",
  registered: "Awaiting approval",
  waitlisted: "On the waitlist",
  already_registered: "Already submitted",
};

const DONE_TITLE: Record<string, string> = {
  registered: "Registration submitted",
  waitlisted: "Added to the waitlist",
  already_registered: "You've already registered for this event",
};

const NEXT_STEPS: Record<string, string[]> = {
  registered: [
    "The organizer reviews your registration",
    "You get a confirmation email with the details",
  ],
  waitlisted: [
    "The organizer reviews the waitlist",
    "You get an email if you're approved",
  ],
  already_registered: [],
};

export function RegistrationDetails({
  registration,
  busy,
  onConfirm,
  timeZone,
  confirmElsewhere = false,
}: {
  registration: Registration;
  busy: boolean;
  onConfirm: () => void;
  timeZone?: string;
  /** The thread's confirm card holds this change, so no button here. */
  confirmElsewhere?: boolean;
}) {
  const { event, status, actionable } = registration;
  const isPreview = status === "preview";
  const when = formatEventTime(event?.start, event?.end, timeZone);
  const outcome = outcomeText(registration);
  const heading = useRef<HTMLHeadingElement>(null);

  // Confirm disappears when the step finishes, so keep focus in the panel.
  const wasPreview = useRef(isPreview);
  useEffect(() => {
    if (wasPreview.current && !isPreview) heading.current?.focus();
    wasPreview.current = isPreview;
  }, [isPreview]);

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

      <div>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-xl font-bold outline-none"
        >
          {event?.title ?? "Event registration"}
        </h2>
        {event && (
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
        )}
      </div>

      <div
        role="status"
        className="flex flex-col gap-4"
      >
        {isPreview && actionable && confirmElsewhere && (
          <div className="bg-muted rounded-md border p-4">
            <p className="text-sm">
              Confirm this change with the others in the chat.
            </p>
          </div>
        )}
        {isPreview && actionable && !confirmElsewhere && (
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
        )}
        {isPreview && !actionable && (
          <div className="bg-muted rounded-md border p-4">
            {/* Right after a confirm the reply is on its way, so the preview
                is only out of date until the result arrives. */}
            <p className="text-sm">
              {busy
                ? "Checking with the assistant…"
                : "Nothing has been submitted. Ask the assistant to check this event again to register."}
            </p>
          </div>
        )}
        {!isPreview && (
          <div className="bg-muted rounded-md border p-4">
            <p className="font-semibold">✓ {DONE_TITLE[status]}</p>
            {NEXT_STEPS[status].length > 0 && (
              <ol
                aria-label="What happens next"
                className="mt-2 flex flex-col gap-1 text-sm"
              >
                {NEXT_STEPS[status].map((step) => (
                  <li key={step}>○ {step}</li>
                ))}
              </ol>
            )}
            {event?.url && (
              <a
                href={event.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm"
              >
                View the event page
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Opens the side panel when the conversation reaches a new registration step. */
export function RegistrationPanel({
  onConfirm,
  confirmElsewhere = false,
}: {
  onConfirm: (message: string, blocks: ConfirmBlock[]) => void;
  confirmElsewhere?: boolean;
}) {
  const stream = useStreamContext();
  const registration = useMemo(
    () => latestRegistration(stream.messages),
    [stream.messages],
  );
  const [Artifact, { open, setOpen }] = useArtifact();
  const shownKey = useRef<string | null>(null);
  // The software grid shares the panel; only the newest step takes it, and
  // only the panel holding it closes it.
  const owns = useMemo(
    () => newestPanelStep(stream.messages) === "registration",
    [stream.messages],
  );

  const key = registration?.key ?? null;
  useEffect(() => {
    if (key !== shownKey.current) {
      shownKey.current = key;
      if (key === null) {
        if (open) setOpen(false);
      } else if (owns) {
        setOpen(true);
      }
    }
  }, [key, owns, open, setOpen]);

  if (!registration) return null;
  return (
    <Artifact title="Event registration">
      <RegistrationDetails
        registration={registration}
        busy={stream.isLoading}
        confirmElsewhere={confirmElsewhere}
        onConfirm={() =>
          onConfirm(
            confirmMessage(registration),
            registration.previewId
              ? [confirmBlock([registration.previewId])]
              : [],
          )
        }
      />
    </Artifact>
  );
}
