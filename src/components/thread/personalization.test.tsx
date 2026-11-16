import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ status: "signed_in" }));
const agent = vi.hoisted(() => ({
  reply: { consent: "unset" } as { consent: string } | null,
  posted: [] as string[],
}));

vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => auth.status,
}));
vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({ apiUrl: "https://agent.example/api/v1" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/agent-fetch", () => ({
  authorize: async (_: unknown, init: RequestInit) => init,
  createAgentFetch: () => async (_url: string, init: RequestInit) => {
    if (init.method === "POST") {
      const choice = JSON.parse(String(init.body)).consent as string;
      agent.posted.push(choice);
      if (!agent.reply) return new Response("{}", { status: 503 });
      return new Response(
        JSON.stringify({ consent: choice === "not_now" ? "unset" : choice }),
      );
    }
    return agent.reply
      ? new Response(JSON.stringify(agent.reply))
      : new Response("{}", { status: 503 });
  },
}));
vi.mock("@/lib/agent-token", () => ({ getAgentTokenSource: () => ({}) }));

async function load() {
  const p = await import("@/lib/personalization");
  const settings = await import("./settings");
  const offer = await import("./personalization-offer");
  const { toast } = await import("sonner");
  return { p, ...settings, ...offer, toast };
}

beforeEach(() => {
  vi.resetModules();
  auth.status = "signed_in";
  agent.reply = { consent: "unset" };
  agent.posted = [];
});

describe("Settings", () => {
  it("isn't shown to a signed-out reader", async () => {
    auth.status = "signed_out";
    const { SettingsButton } = await load();
    render(<SettingsButton />);
    expect(screen.queryByRole("button", { name: "Settings" })).toBeNull();
  });

  it("opens to the personalized answers switch, off until allowed", async () => {
    const { SettingsButton } = await load();
    render(<SettingsButton />);
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const toggle = await screen.findByRole("switch", {
      name: "Personalized answers",
    });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(toggle).toHaveAccessibleDescription(/your login on each/);
  });

  it("turns personalized answers on and off", async () => {
    const { PersonalizationSwitch } = await load();
    render(<PersonalizationSwitch />);
    const toggle = screen.getByRole("switch", { name: "Personalized answers" });
    await waitFor(() => expect(toggle).toBeEnabled());

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "true"));
    await userEvent.click(toggle);
    await waitFor(() =>
      expect(toggle).toHaveAttribute("aria-checked", "false"),
    );
    expect(agent.posted).toEqual(["allow", "deny"]);
  });

  it("says when the setting can't be loaded, and can try again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    agent.reply = null;
    const { PersonalizationSwitch } = await load();
    render(<PersonalizationSwitch />);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Couldn't load this setting.",
    );
    expect(
      screen.getByRole("switch", { name: "Personalized answers" }),
    ).toBeDisabled();

    agent.reply = { consent: "allow" };
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Personalized answers" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
  });

  it("keeps the old state and says so when a change can't be saved", async () => {
    const { PersonalizationSwitch, toast } = await load();
    render(<PersonalizationSwitch />);
    const toggle = screen.getByRole("switch", { name: "Personalized answers" });
    await waitFor(() => expect(toggle).toBeEnabled());
    agent.reply = null;
    await userEvent.click(toggle);
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});

describe("the offer card", () => {
  it("shows only on the thread it was offered for", async () => {
    const { PersonalizationOffer, p } = await load();
    act(() => p.showOffer("t1"));
    const { rerender } = render(
      <PersonalizationOffer
        threadId="t2"
        busy={false}
      />,
    );
    expect(screen.queryByRole("region")).toBeNull();
    rerender(
      <PersonalizationOffer
        threadId="t1"
        busy={false}
      />,
    );
    expect(
      screen.getByRole("region", {
        name: "Start from the resources you already have?",
      }),
    ).toBeInTheDocument();
  });

  it("Allow turns personalized answers on and closes the card", async () => {
    const { PersonalizationOffer, p } = await load();
    act(() => p.showOffer("t1"));
    render(
      <PersonalizationOffer
        threadId="t1"
        busy={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
    expect(agent.posted).toEqual(["allow"]);
  });

  it("Allow for this conversation saves nothing and covers this thread", async () => {
    const { PersonalizationOffer, p } = await load();
    act(() => p.showOffer("t1"));
    render(
      <PersonalizationOffer
        threadId="t1"
        busy={false}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Allow for this conversation" }),
    );
    expect(screen.queryByRole("region")).toBeNull();
    expect(p.isAllowedOnce("t1")).toBe(true);
    expect(agent.posted).toEqual([]);
  });

  it("Not now just closes it", async () => {
    const { PersonalizationOffer, p } = await load();
    act(() => p.showOffer("t1"));
    render(
      <PersonalizationOffer
        threadId="t1"
        busy={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region")).toBeNull();
    expect(p.isAllowedOnce("t1")).toBe(false);
    expect(agent.posted).toEqual([]);
  });

  it("keeps the card when Allow can't be saved", async () => {
    const { PersonalizationOffer, p, toast } = await load();
    agent.reply = null;
    act(() => p.showOffer("t1"));
    render(
      <PersonalizationOffer
        threadId="t1"
        busy={false}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("can't be answered while an answer is streaming", async () => {
    const { PersonalizationOffer, p } = await load();
    act(() => p.showOffer("t1"));
    render(
      <PersonalizationOffer
        threadId="t1"
        busy
      />,
    );
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Allow for this conversation" }),
    ).toBeDisabled();
  });
});
