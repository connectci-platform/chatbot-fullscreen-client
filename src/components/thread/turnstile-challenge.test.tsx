import { useEffect, type ReactNode } from "react";
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
    useEffect(() => {
      if (script.fails) onError?.();
      else onReady?.();
      // Next runs these once per mount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  },
}));
vi.mock("@/lib/sign-in", () => ({ openSignIn: vi.fn() }));

const turnstile = { render: vi.fn(), remove: vi.fn() };
const lastOptions = () =>
  turnstile.render.mock.calls.at(-1)?.[1] as WidgetOptions;

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
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    expect(lastOptions().sitekey).toBe("site-key");
    expect(screen.getByRole("alert").textContent).toContain(
      "Confirm you're human",
    );
  });

  it("hands over the token when the check passes", () => {
    const onVerified = vi.fn();
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={onVerified}
      />,
    );
    act(() => lastOptions().callback("tok"));
    expect(onVerified).toHaveBeenCalledWith("tok");
  });

  it("uses the latest handler when the check passes after a re-render", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { rerender } = render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={first}
      />,
    );
    rerender(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={latest}
      />,
    );
    act(() => lastOptions().callback("tok"));
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("tok");
  });

  it("always offers sign-in as the other way forward", () => {
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(openSignIn).toHaveBeenCalledOnce();
  });

  it("removes the widget when it unmounts", () => {
    const { unmount } = render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    unmount();
    expect(turnstile.remove).toHaveBeenCalledWith("widget-1");
  });

  it("explains a failed check and stops Turnstile retrying forever", () => {
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    let handled = false;
    act(() => {
      handled = lastOptions()["error-callback"]();
    });
    expect(handled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("couldn't run");
    screen.getByRole("button", { name: "Sign in" });
  });

  it("explains when the script can't load", () => {
    script.fails = true;
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("couldn't run");
  });

  it("explains when the script loads without the Turnstile API", () => {
    vi.stubGlobal("turnstile", undefined);
    render(
      <TurnstileChallengePanel
        siteKey="site-key"
        onVerified={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("couldn't run");
  });

  it("offers sign-in alone when the agent sent no site key", () => {
    render(
      <TurnstileChallengePanel
        siteKey=""
        onVerified={vi.fn()}
      />,
    );
    expect(turnstile.render).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("couldn't run");
  });
});
