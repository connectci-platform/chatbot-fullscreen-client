"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { program } from "@/config/program";
import {
  allowOnce,
  dismissOffer,
  saveConsent,
  usePersonalization,
} from "@/lib/personalization";
import { useStreamContext } from "@/providers/Stream";
import { PERSONALIZATION_DESCRIPTION } from "./settings";

/**
 * The agent's offer, after an answer that the user's own resources would
 * have changed. Allow turns personalized answers on, Allow once uses them
 * for the rest of this conversation, Not now closes the card. The agent has
 * already recorded the ask, so it won't offer again for 30 days either way.
 */
export function PersonalizationOffer({
  threadId,
  busy,
}: {
  threadId: string | null;
  busy: boolean;
}): ReactNode {
  const { apiUrl } = useStreamContext();
  const { offerThreadId } = usePersonalization();
  const [saving, setSaving] = useState(false);
  if (!threadId || offerThreadId !== threadId) return null;

  const allow = () => {
    setSaving(true);
    saveConsent(apiUrl, "allow")
      .then(() => {
        dismissOffer();
        toast.success(
          "Personalized answers are on. You can turn them off in Settings.",
        );
      })
      .catch(() =>
        toast.error("Couldn't save this setting. Try again.", {
          closeButton: true,
        }),
      )
      .finally(() => setSaving(false));
  };

  return (
    <section
      aria-labelledby="personalization-offer-title"
      className="bg-muted flex flex-col gap-3 rounded-md border p-4"
    >
      <h2
        id="personalization-offer-title"
        className="font-semibold"
      >
        Start from the resources you already have?
      </h2>
      <p className="text-sm">
        {PERSONALIZATION_DESCRIPTION}{" "}
        <a
          href={program.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Notice
        </a>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || saving}
          onClick={allow}
        >
          Allow
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || saving}
          onClick={() => allowOnce(threadId)}
        >
          Allow for this conversation
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={saving}
          onClick={dismissOffer}
        >
          Not now
        </Button>
      </div>
    </section>
  );
}
