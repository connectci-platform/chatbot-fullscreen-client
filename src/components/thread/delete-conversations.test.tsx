import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";

const threads = vi.hoisted(() => ({
  list: [] as unknown[],
  setThreads: vi.fn(),
}));
const api = vi.hoisted(() => ({
  deleteConversation: vi.fn(),
  deleteAllConversations: vi.fn(),
}));

vi.mock("@/hooks/use-agent-auth", () => ({ useAuthStatus: () => "signed_in" }));
vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({ apiUrl: "https://agent.example/api/v1" }),
}));
vi.mock("@/providers/Thread", () => ({
  useThreads: () => ({
    getThreads: () => Promise.resolve(threads.list),
    threads: threads.list,
    setThreads: threads.setThreads,
    threadsLoading: false,
    setThreadsLoading: vi.fn(),
  }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const forget = vi.hoisted(() => vi.fn());
vi.mock("@/lib/forget-conversation", () => ({ forgetConversations: forget }));
vi.mock("@/lib/conversations", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/conversations")>()),
  deleteConversation: api.deleteConversation,
  deleteAllConversations: api.deleteAllConversations,
}));

import { toast } from "sonner";
import { DeleteError } from "@/lib/conversations";
import ThreadHistory from "./history";
import { DeleteAllConversations } from "./settings";

const thread = (id: string, question: string) => ({
  thread_id: id,
  values: { messages: [{ type: "human", content: question }] },
});

const onNewChat = vi.fn();

function renderSidebar(searchParams = "") {
  render(
    <NuqsTestingAdapter
      searchParams={searchParams}
      hasMemory
    >
      <ThreadHistory onNewChat={onNewChat} />
    </NuqsTestingAdapter>,
  );
}

beforeEach(() => {
  threads.list = [thread("t1", "GPUs on Delta?"), thread("t2", "Python?")];
  threads.setThreads.mockReset();
  api.deleteConversation.mockReset();
  api.deleteAllConversations.mockReset();
  onNewChat.mockReset();
  forget.mockReset();
  vi.mocked(toast.success).mockReset();
  vi.mocked(toast.error).mockReset();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("deleting one conversation from the sidebar", () => {
  it("asks first, naming the conversation, and Cancel deletes nothing", async () => {
    renderSidebar();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Delete conversation: GPUs on Delta?",
      }),
    );
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete this conversation?",
    });
    expect(dialog).toHaveTextContent('"GPUs on Delta?"');
    expect(dialog).toHaveTextContent("This can't be undone.");
    // Enter alone doesn't confirm: Cancel has focus.
    expect(
      within(dialog).getByRole("button", { name: "Cancel" }),
    ).toHaveFocus();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(api.deleteConversation).not.toHaveBeenCalled();
  });

  it("deletes it, drops it from the list, and starts a new chat if it was open", async () => {
    api.deleteConversation.mockResolvedValue(undefined);
    renderSidebar("?threadId=t1");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Delete conversation: GPUs on Delta?",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.deleteConversation).toHaveBeenCalledWith(
      "https://agent.example/api/v1",
      "t1",
    );
    // The sidebar also sets the list once on load; the delete's update is a function.
    const update = threads.setThreads.mock.calls
      .map(([arg]) => arg)
      .find((arg) => typeof arg === "function");
    expect(
      update(threads.list).map((t: { thread_id: string }) => t.thread_id),
    ).toEqual(["t2"]);
    expect(toast.success).toHaveBeenCalledWith("Conversation deleted.");
    // The thread view's own new chat, which also closes its side panels.
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(forget).toHaveBeenCalledWith("t1");
  });

  it("puts focus on the next conversation after deleting one that wasn't open", async () => {
    api.deleteConversation.mockResolvedValue(undefined);
    threads.list = [
      thread("t1", "GPUs on Delta?"),
      thread("t2", "Python?"),
      thread("t3", "Globus?"),
    ];
    renderSidebar("?threadId=t3");
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Delete conversation: Python?",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onNewChat).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(document.activeElement?.id).toBe("conversation-t3"),
    );
  });

  it("shortens a long title in the label and the dialog", async () => {
    threads.list = [thread("t1", "x".repeat(200))];
    renderSidebar();
    const button = await screen.findByRole("button", {
      name: `Delete conversation: ${"x".repeat(77)}…`,
    });
    await userEvent.click(button);
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      `"${"x".repeat(77)}…"`,
    );
  });

  it("keeps the dialog open and says why when deleting fails", async () => {
    api.deleteConversation.mockRejectedValue(
      new DeleteError(
        "An answer is still being written. Try again when it finishes.",
        409,
      ),
    );
    renderSidebar();
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Delete conversation: Python?",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "An answer is still being written. Try again when it finishes.",
        { closeButton: true },
      ),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(
      threads.setThreads.mock.calls.some(([arg]) => typeof arg === "function"),
    ).toBe(false);
  });
});

describe("deleting all conversations from Settings", () => {
  function renderSetting() {
    render(
      <NuqsTestingAdapter
        searchParams="?threadId=t1"
        hasMemory
      >
        <DeleteAllConversations onDeleted={onNewChat} />
      </NuqsTestingAdapter>,
    );
  }

  it("asks first, then deletes all and empties the list", async () => {
    api.deleteAllConversations.mockResolvedValue(3);
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    const dialog = screen.getByRole("alertdialog", {
      name: "Delete all conversations?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete all" }),
    );

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(api.deleteAllConversations).toHaveBeenCalledWith(
      "https://agent.example/api/v1",
    );
    expect(threads.setThreads).toHaveBeenCalledWith([]);
    expect(forget).toHaveBeenCalledWith();
    expect(onNewChat).toHaveBeenCalledOnce();
    expect(toast.success).toHaveBeenCalledWith("Deleted 3 conversations.");
  });

  it("says 1 conversation in the singular", async () => {
    api.deleteAllConversations.mockResolvedValue(1);
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Deleted 1 conversation."),
    );
  });

  it("reports a failure and keeps the list", async () => {
    api.deleteAllConversations.mockRejectedValue(new Error("network"));
    renderSetting();
    await userEvent.click(screen.getByRole("button", { name: "Delete…" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't delete. Try again.", {
        closeButton: true,
      }),
    );
    expect(threads.setThreads).not.toHaveBeenCalled();
  });
});
