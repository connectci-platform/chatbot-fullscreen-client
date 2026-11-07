import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { Button } from "@/components/ui/button";
import { program } from "@/config/program";
import { openSignIn } from "@/lib/sign-in";

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "error-callback": () => boolean;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Shown when the agent wants a signed-out person to pass a Turnstile check.
 * Passing it, or signing in, sends the question again.
 */
export function TurnstileChallengePanel({
  siteKey,
  onVerified,
}: {
  siteKey: string;
  onVerified: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(!siteKey);

  // The widget keeps the callback it was rendered with, and the person may
  // take a while, so it calls through a ref to reach the current handler.
  const verified = useRef(onVerified);
  useEffect(() => {
    verified.current = onVerified;
  });

  useEffect(
    () => () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
    },
    [],
  );

  const renderWidget = () => {
    if (widgetId.current || !container.current) return;
    if (!window.turnstile) {
      setFailed(true);
      return;
    }
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: (token) => verified.current(token),
      "error-callback": () => {
        setFailed(true);
        // Tells Turnstile the error is handled, or it retries forever.
        return true;
      },
    });
  };

  return (
    <div
      role="alert"
      className="border-input mb-2 flex flex-col gap-3 border border-solid bg-white p-4 text-sm"
    >
      <p>
        {failed
          ? `We couldn't run the check. Reload the page to try again, or sign in with your ${program.accountName}.`
          : `Confirm you're human to get your answer, or sign in with your ${program.accountName}.`}
      </p>
      {siteKey && (
        <>
          <Script
            src={SCRIPT_URL}
            onReady={renderWidget}
            onError={() => setFailed(true)}
          />
          <div
            ref={container}
            hidden={failed}
          />
        </>
      )}
      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={() => openSignIn()}
      >
        Sign in
      </Button>
    </div>
  );
}
