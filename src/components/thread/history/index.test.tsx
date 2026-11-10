import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus } from "@/lib/agent-token";
import ThreadHistory from ".";
import { ConversationsToggle, NewChatButton } from "../conversation-controls";

const auth: { status: AuthStatus } = { status: "unknown" };
const threadsApi = {
  getThreads: (): Promise<unknown[]> => Promise.resolve([]),
  threads: [] as unknown[],
};

vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => auth.status,
}));

vi.mock("@/providers/Thread", () => ({
  useThreads: () => ({
    getThreads: () => threadsApi.getThreads(),
    threads: threadsApi.threads,
    setThreads: vi.fn(),
    threadsLoading: false,
    setThreadsLoading: vi.fn(),
  }),
}));

const onNewChat = vi.fn();

function renderHistory(searchParams = "") {
  return render(
    <NuqsTestingAdapter
      searchParams={searchParams}
      hasMemory
    >
      <ThreadHistory onNewChat={onNewChat} />
      <main>
        <ConversationsToggle />
        <NewChatButton onClick={onNewChat} />
      </main>
    </NuqsTestingAdapter>,
  );
}

describe("ThreadHistory", () => {
  beforeEach(() => {
    auth.status = "unknown";
    threadsApi.getThreads = () => Promise.resolve([]);
    threadsApi.threads = [];
    onNewChat.mockClear();
    setLargeScreen(true);
  });

  function setLargeScreen(large: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: large,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  }

  it("tells a signed-in person with no conversations there are none yet", () => {
    auth.status = "signed_in";
    renderHistory();
    expect(screen.getByText("No conversations yet.")).toBeTruthy();
    expect(
      screen.queryByText("Sign in to see and resume your conversations."),
    ).toBeNull();
  });

  it("says the load failed instead of claiming there are no conversations", async () => {
    auth.status = "signed_in";
    vi.spyOn(console, "error").mockImplementation(() => {});
    threadsApi.getThreads = () => Promise.reject(new Error("boom"));
    renderHistory();
    await waitFor(() =>
      expect(
        screen.getByText("Couldn't load your conversations."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("No conversations yet.")).toBeNull();
  });

  it("asks a signed-out person to sign in", () => {
    auth.status = "signed_out";
    renderHistory();
    expect(
      screen.getByText("Sign in to see and resume your conversations."),
    ).toBeTruthy();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
  });

  it("shows neither message while the sign-in state is unknown", () => {
    renderHistory();
    expect(screen.queryByText("No conversations yet.")).toBeNull();
    expect(
      screen.queryByText("Sign in to see and resume your conversations."),
    ).toBeNull();
  });

  it("names the toggle for what it will do, with the panel icons", () => {
    const { unmount } = renderHistory();
    const show = screen.getByRole("button", { name: "Show conversations" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    expect(show.querySelector(".lucide-panel-left-open")).not.toBeNull();
    unmount();
    renderHistory("?chatHistoryOpen=true");
    const hide = screen.getByRole("button", { name: "Hide conversations" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(hide).toHaveTextContent("Hide");
    expect(hide.querySelector(".lucide-panel-left-close")).not.toBeNull();
  });

  it("points the toggle at the sidebar it opens", () => {
    renderHistory();
    const show = screen.getByRole("button", { name: "Show conversations" });
    const sidebar = document.getElementById(
      show.getAttribute("aria-controls")!,
    );
    expect(sidebar).not.toBeNull();
    expect(sidebar).toHaveAccessibleName("Conversations");
  });

  it("keeps a closed sidebar's controls out of keyboard reach", () => {
    renderHistory();
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
      hidden: true,
    });
    expect(sidebar).toHaveAttribute("inert");
  });

  it("makes an open sidebar's controls reachable", () => {
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    expect(sidebar).not.toHaveAttribute("inert");
    expect(
      within(sidebar).getByRole("button", { name: "Hide conversations" }),
    ).toBeInTheDocument();
  });

  it("hides the top bar's toggle while the sidebar is open on a wide screen", () => {
    renderHistory("?chatHistoryOpen=true");
    expect(
      screen.queryByRole("button", { name: "Show conversations" }),
    ).toBeNull();
  });

  it("offers a labeled New chat at the top of the open sidebar", async () => {
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    const newChat = within(sidebar).getByRole("button", { name: "New chat" });
    expect(newChat).toHaveTextContent("New chat");
    expect(newChat).toHaveClass("bg-brand-dark", "text-white");
    expect(newChat.querySelector(".lucide-message-square-plus")).not.toBeNull();
    await userEvent.click(newChat);
    expect(onNewChat).toHaveBeenCalledOnce();
  });

  it("gives every sidebar control at least a 44px touch target", () => {
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    for (const button of within(sidebar).getAllByRole("button")) {
      expect(button.className).toMatch(/\b(min-h-11|h-11|size-11)\b/);
    }
  });

  it("moves focus into the sidebar when it opens, and back to the toggle when it closes", async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(
      screen.getByRole("button", { name: "Show conversations" }),
    );
    const hide = screen.getByRole("button", { name: "Hide conversations" });
    await waitFor(() => expect(hide).toHaveFocus());

    await user.click(hide);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Show conversations" }),
      ).toHaveFocus(),
    );
  });

  it("closes the sidebar with Escape and returns focus to the toggle", async () => {
    const user = userEvent.setup();
    renderHistory();
    await user.click(
      screen.getByRole("button", { name: "Show conversations" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Hide conversations" }),
      ).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Show conversations" }),
      ).toHaveFocus(),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Conversations",
        hidden: true,
      }),
    ).toHaveAttribute("inert");
  });

  it("doesn't take focus when the page loads with the sidebar open", () => {
    renderHistory("?chatHistoryOpen=true");
    expect(document.body).toHaveFocus();
  });

  it("lists a signed-in person's conversations by their first question, marking the open one", async () => {
    auth.status = "signed_in";
    threadsApi.threads = [
      {
        thread_id: "t-1",
        values: { messages: [{ type: "human", content: "What is Anvil?" }] },
      },
      {
        thread_id: "t-2",
        values: { messages: [{ type: "human", content: "GPU queues" }] },
      },
    ];
    renderHistory("?chatHistoryOpen=true&threadId=t-2");
    const nav = within(
      screen.getByRole("complementary", { name: "Conversations" }),
    ).getByRole("list");
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    const anvil = within(nav).getByRole("button", { name: "What is Anvil?" });
    const gpu = within(nav).getByRole("button", { name: "GPU queues" });
    expect(gpu).toHaveAttribute("aria-current", "page");
    expect(anvil).not.toHaveAttribute("aria-current");
    expect(anvil.className).toMatch(/\bmin-h-11\b/);

    await userEvent.click(anvil);
    expect(anvil).toHaveAttribute("aria-current", "page");
  });

  it("draws the toggle, Hide and New chat icons at 24px", () => {
    const { unmount } = renderHistory();
    expect(
      screen
        .getByRole("button", { name: "Show conversations" })
        .querySelector("svg"),
    ).toHaveClass("size-6");
    unmount();
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    for (const name of ["Hide conversations", "New chat"]) {
      expect(
        within(sidebar).getByRole("button", { name }).querySelector("svg"),
      ).toHaveClass("size-6");
    }
  });

  it("names the sidebar by its heading, once", () => {
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    const heading = within(sidebar).getByRole("heading", {
      name: "Conversations",
    });
    expect(sidebar).toHaveAttribute("aria-labelledby", heading.id);
    expect(sidebar).not.toHaveAttribute("aria-label");
  });

  it("ends the sidebar with the site's links, for anyone, signed in or not", () => {
    auth.status = "signed_out";
    renderHistory("?chatHistoryOpen=true");
    const sidebar = screen.getByRole("complementary", {
      name: "Conversations",
    });
    const links = within(sidebar).getByRole("navigation", {
      name: "ACCESS links",
    });
    for (const name of [
      "NSF awards",
      "Contact ACCESS",
      "Acceptable Use",
      "Code of Conduct",
      "Privacy Policy",
    ]) {
      expect(within(links).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  describe("on a phone", () => {
    beforeEach(() => setLargeScreen(false));

    it("keeps the toggle in the top bar while the list is open", () => {
      renderHistory("?chatHistoryOpen=true");
      expect(
        screen.getByRole("button", { name: "Hide conversations" }),
      ).toBeInTheDocument();
    });

    it("opens the list as a dialog with Hide and New chat, and no second close button", () => {
      renderHistory("?chatHistoryOpen=true");
      const dialog = screen.getByRole("dialog", { name: "Conversations" });
      expect(
        within(dialog).getByRole("button", { name: "Hide conversations" }),
      ).toHaveTextContent("Hide");
      expect(
        within(dialog).getByRole("button", { name: "New chat" }),
      ).toBeInTheDocument();
      expect(
        within(dialog).queryByRole("button", { name: "Close" }),
      ).toBeNull();
      // There's no sidebar on screen for it to point at.
      expect(
        within(dialog).getByRole("button", { name: "Hide conversations" }),
      ).not.toHaveAttribute("aria-controls");
    });

    it("ends the list with the site's links", () => {
      auth.status = "signed_out";
      renderHistory("?chatHistoryOpen=true");
      const dialog = screen.getByRole("dialog", { name: "Conversations" });
      expect(
        within(dialog).getByRole("link", { name: "Code of Conduct" }),
      ).toHaveAttribute("href", "https://access-ci.org/code-of-conduct/");
    });

    it("New chat starts a conversation and closes the list", async () => {
      renderHistory("?chatHistoryOpen=true");
      const dialog = screen.getByRole("dialog", { name: "Conversations" });
      await userEvent.click(
        within(dialog).getByRole("button", { name: "New chat" }),
      );
      expect(onNewChat).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Conversations" }),
        ).toBeNull(),
      );
    });

    it.each(["Hide", "Escape"])(
      "%s closes the list and returns focus to the toggle",
      async (how) => {
        const user = userEvent.setup();
        renderHistory();
        await user.click(
          screen.getByRole("button", { name: "Show conversations" }),
        );
        const dialog = await screen.findByRole("dialog", {
          name: "Conversations",
        });
        if (how === "Hide") {
          await user.click(
            within(dialog).getByRole("button", { name: "Hide conversations" }),
          );
        } else {
          await user.keyboard("{Escape}");
        }
        await waitFor(() =>
          expect(
            screen.queryByRole("dialog", { name: "Conversations" }),
          ).toBeNull(),
        );
        await waitFor(() =>
          expect(
            screen.getByRole("button", { name: "Show conversations" }),
          ).toHaveFocus(),
        );
      },
    );
  });
});
