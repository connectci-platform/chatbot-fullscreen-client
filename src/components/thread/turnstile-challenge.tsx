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

type WidgetProps = {
  siteKey: string;
  onVerified: (token: string) => void;
  onFailed: () => void;
};

function TurnstileWidget({ siteKey, onVerified, onFailed }: WidgetProps) {
  const container = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(false);

  // The widget keeps the callbacks it was rendered with, and the person may
  // take a while, so it calls through a ref to reach the current handlers.
  const handlers = useRef({ onVerified, onFailed });
  useEffect(() => {
    handlers.current = { onVerified, onFailed };
  });

  // An effect, not onReady directly: Next calls onReady once, so a widget it
  // rendered wouldn't come back after Strict Mode's simulated unmount.
  useEffect(() => {
    if (!scriptReady || !container.current) return;
    if (!window.turnstile) {
      handlers.current.onFailed();
      return;
    }
    const widgetId = window.turnstile.render(container.current, {
      sitekey: siteKey,
      callback: (token) => handlers.current.onVerified(token),
      "error-callback": () => {
        handlers.current.onFailed();
        // Tells Turnstile the error is handled, or it retries forever.
        return true;
      },
    });
    return () => window.turnstile?.remove(widgetId);
  }, [scriptReady, siteKey]);

  return (
    <>
      <Script
        src={SCRIPT_URL}
        onReady={() => setScriptReady(true)}
        onError={() => handlers.current.onFailed()}
      />
      <div ref={container} />
    </>
  );
}

/**
 * Shown when the agent wants a signed-out person to pass a Turnstile check.
 * Passing it, or signing in, sends the question again. Once failed it shows no
 * widget: a widget can pass by itself, and only the person may start a retry.
 */
export function TurnstileChallengePanel({
  failed,
  ...widget
}: WidgetProps & { failed: boolean }) {
  return (
    <div
      role="alert"
      className="border-input mb-2 flex flex-col gap-3 border border-solid bg-white p-4 text-sm"
    >
      <p>
        {failed
          ? `We couldn't confirm the check. Your question is back in the message box, so you can send it to try again, or sign in with your ${program.accountName}.`
          : `Confirm you're human to get your answer, or sign in with your ${program.accountName}.`}
      </p>
      {!failed && <TurnstileWidget {...widget} />}
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
