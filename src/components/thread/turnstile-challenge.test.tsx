import { StrictMode, useEffect, useRef, type ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openSignIn } from "@/lib/sign-in";
import { TurnstileChallengePanel } from "./turnstile-challenge";

type WidgetOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "error-callback": () => boolean;
};

const script = vi.hoisted(() => ({ fails: false }));

vi.mock("next/script", () => ({
  default: function MockScript(props: {
    src: string;
    onReady?: () => void;
    onError?: () => void;
  }): ReactNode {
    const { onReady, onError } = props;
    // Like Next, which calls onReady once even when Strict Mode re-runs effects.
    const called = useRef(false);
    useEffect(() => {
      if (called.current) return;
      called.current = true;
      if (script.fails) onError?.();
      else onReady?.();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
}));
vi.mock("@/lib/sign-in", () => ({ openSignIn: vi.fn() }));

const turnstile = { render: vi.fn(), remove: vi.fn() };
const lastOptions = () =>
  turnstile.render.mock.calls.at(-1)?.[1] as WidgetOptions;

function panel(props: Partial<Parameters<typeof TurnstileChallengePanel>[0]>) {
  return (
    <TurnstileChallengePanel
      siteKey="site-key"
      failed={false}
      onVerified={vi.fn()}
      onFailed={vi.fn()}
      {...props}
    />
  );
}

const alertText = () => screen.getByRole("alert").textContent;

describe("TurnstileChallengePanel", () => {
  beforeEach(() => {
    script.fails = false;
    turnstile.render.mockReset().mockReturnValue("widget-1");
    turnstile.remove.mockReset();
    vi.stubGlobal("turnstile", turnstile);
    vi.mocked(openSignIn).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("renders the widget with the agent's site key", () => {
    render(panel({}));
    expect(lastOptions().sitekey).toBe("site-key");
    expect(alertText()).toContain("Confirm you're human");
  });

  it("hands over the token when the check passes", () => {
    const onVerified = vi.fn();
    render(panel({ onVerified }));
    act(() => lastOptions().callback("tok"));
    expect(onVerified).toHaveBeenCalledWith("tok");
  });

  it("uses the latest handler when the check passes after a re-render", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(panel({ onVerified: first }));
    rerender(panel({ onVerified: latest }));
    act(() => lastOptions().callback("tok"));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("tok");
  });

  it("always offers sign-in as the other way forward", () => {
    render(panel({}));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openSignIn).toHaveBeenCalledOnce();
  });

  it("removes the widget when it unmounts", () => {
    const { unmount } = render(panel({}));
    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });

  it("keeps a live widget when Strict Mode re-runs effects", () => {
    render(<StrictMode>{panel({})}</StrictMode>);
    expect(turnstile.render.mock.calls.length).toBe(
      turnstile.remove.mock.calls.length + 1,
    );
  });

  it("reports a failed check and stops Turnstile retrying forever", () => {
    const onFailed = vi.fn();
    render(panel({ onFailed }));
    let handled = false;
    act(() => {
      handled = lastOptions()["error-callback"]();
    });
    expect(handled).toBe(true);
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it("reports when the script can't load", () => {
    script.fails = true;
    const onFailed = vi.fn();
    render(panel({ onFailed }));
    expect(onFailed).toHaveBeenCalledOnce();
  });

  it("reports when the script loads without the Turnstile API", () => {
    vi.stubGlobal("turnstile", undefined);
    const onFailed = vi.fn();
    render(panel({ onFailed }));
    expect(onFailed).toHaveBeenCalledOnce();
  });

  describe("when failed", () => {
    it("never renders a widget, so nothing can pass and resend by itself", () => {
      render(panel({ failed: true }));
      expect(turnstile.render).not.toHaveBeenCalled();
    });

    it("removes a widget that was already showing", () => {
      const { rerender } = render(panel({}));
      rerender(panel({ failed: true }));
      expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
    });

    it("points at the restored question, not a reload", () => {
      render(panel({ failed: true }));
      expect(alertText()).toContain("back in the message box");
      expect(alertText()).not.toContain("Reload");
    });

    it("still offers sign-in", () => {
      render(panel({ failed: true }));
      fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
      expect(openSignIn).toHaveBeenCalledOnce();
    });
  });
});
