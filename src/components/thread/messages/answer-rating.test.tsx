import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { AnswerRating } from "./answer-rating";

const ratings = vi.hoisted(() => ({
  loadRatings: vi.fn(),
  saveRating: vi.fn(),
}));

vi.mock("@/lib/answer-ratings", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/answer-ratings")>()),
  loadRatings: ratings.loadRatings,
  saveRating: ratings.saveRating,
}));

// Radix opens the tooltip on focus and measures it; jsdom has no observer.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const answer: Message = { id: "a1", type: "ai", content: "Use SSH." };
const interim: Message = { id: "i1", type: "ai", content: "Checking." };
const question: Message = { id: "h1", type: "human", content: "How?" };

const stream: { messages: Message[] } = { messages: [] };

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    apiUrl: "https://agent.example/api/v1",
    messages: stream.messages,
  }),
}));

function renderRating(
  message: Message = answer,
  { isLoading = false, search = "?threadId=t1" } = {},
) {
  return render(
    <NuqsTestingAdapter searchParams={search}>
      <AnswerRating
        message={message}
        isLoading={isLoading}
      />
    </NuqsTestingAdapter>,
  );
}

const helpful = () => screen.getByRole("button", { name: "Helpful" });
const notHelpful = () => screen.getByRole("button", { name: "Not helpful" });

describe("AnswerRating", () => {
  beforeEach(() => {
    stream.messages = [question, interim, answer];
    ratings.loadRatings.mockReset().mockResolvedValue({});
    ratings.saveRating.mockReset().mockResolvedValue(true);
  });

  it("offers both choices, unpressed, in a labelled group", async () => {
    renderRating();
    expect(
      screen.getByRole("group", { name: "Rate this answer" }),
    ).toBeInTheDocument();
    expect(helpful()).toHaveAttribute("aria-pressed", "false");
    expect(notHelpful()).toHaveAttribute("aria-pressed", "false");
    await waitFor(() =>
      expect(ratings.loadRatings).toHaveBeenCalledWith(
        "https://agent.example/api/v1",
        "t1",
      ),
    );
  });

  it("isn't shown while the answer is still streaming", () => {
    renderRating(answer, { isLoading: true });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("stays on an earlier answer while a new one streams", () => {
    stream.messages = [question, answer, { ...question, id: "h2" }];
    renderRating(answer, { isLoading: true });
    expect(helpful()).toBeInTheDocument();
  });

  it("isn't shown on an interim message or outside a thread", () => {
    renderRating(interim);
    expect(screen.queryByRole("group")).toBeNull();

    renderRating(answer, { search: "" });
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("restores the saved choice on reload", async () => {
    ratings.loadRatings.mockResolvedValue({ a1: "not_helpful" });
    renderRating();
    await waitFor(() =>
      expect(notHelpful()).toHaveAttribute("aria-pressed", "true"),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves helpful once and says thanks", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.click(helpful());
    await user.click(helpful());

    expect(ratings.saveRating).toHaveBeenCalledTimes(1);
    expect(ratings.saveRating).toHaveBeenCalledWith(
      "https://agent.example/api/v1",
      "t1",
      "a1",
      "helpful",
    );
    expect(helpful()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Thanks for your feedback.",
    );
  });

  it("works from the keyboard and takes an optional comment", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.tab();
    expect(helpful()).toHaveFocus();
    await user.tab();
    expect(notHelpful()).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(ratings.saveRating).toHaveBeenLastCalledWith(
      "https://agent.example/api/v1",
      "t1",
      "a1",
      "not_helpful",
    );
    const box = await screen.findByRole("textbox", {
      name: "What was wrong? (optional)",
    });
    expect(box).toHaveFocus();
    expect(box).toHaveAttribute("maxLength", "500");

    await user.keyboard("  Wrong hostname  ");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(ratings.saveRating).toHaveBeenLastCalledWith(
      "https://agent.example/api/v1",
      "t1",
      "a1",
      "not_helpful",
      "Wrong hostname",
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Thanks, we'll use your comment to improve answers.",
    );
  });

  it("closes the comment on Escape and returns focus", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.click(notHelpful());
    await screen.findByRole("textbox");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(notHelpful()).toHaveFocus();
    expect(notHelpful()).toHaveAttribute("aria-pressed", "true");
  });

  it("skipping or sending an empty comment saves nothing more", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.click(notHelpful());
    await user.click(await screen.findByRole("button", { name: "Send" }));
    expect(screen.queryByRole("textbox")).toBeNull();

    await user.click(notHelpful());
    await user.click(await screen.findByRole("button", { name: "Skip" }));

    expect(ratings.saveRating).toHaveBeenCalledTimes(1);
  });

  it("switching to helpful closes the comment", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.click(notHelpful());
    await screen.findByRole("textbox");
    await user.click(helpful());

    expect(screen.queryByRole("textbox")).toBeNull();
    expect(helpful()).toHaveAttribute("aria-pressed", "true");
    expect(notHelpful()).toHaveAttribute("aria-pressed", "false");
  });

  it("puts the choice back when saving fails", async () => {
    const user = userEvent.setup();
    ratings.saveRating.mockResolvedValue(false);
    renderRating();

    await user.click(helpful());

    expect(helpful()).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't save your rating. Please try again.",
    );
  });

  it("keeps focus on a button while its rating saves", async () => {
    let finish: (saved: boolean) => void = () => {};
    ratings.saveRating.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderRating();

    await user.tab();
    await user.keyboard("{Enter}");

    expect(helpful()).toHaveFocus();
    expect(helpful()).toHaveAttribute("aria-disabled", "true");
    expect(helpful()).not.toBeDisabled();
    expect(notHelpful()).toHaveAttribute("aria-disabled", "true");
    await user.click(notHelpful());
    expect(ratings.saveRating).toHaveBeenCalledTimes(1);

    await act(async () => finish(true));
    expect(helpful()).toHaveAttribute("aria-disabled", "false");
    expect(helpful()).toHaveAttribute("aria-pressed", "true");
    expect(notHelpful()).toHaveFocus();
  });

  it("keeps focus on Send while the comment sends", async () => {
    const user = userEvent.setup();
    renderRating();
    await user.click(notHelpful());
    const box = await screen.findByRole("textbox");
    let finish: (saved: boolean) => void = () => {};
    ratings.saveRating.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await user.type(box, "Bad link");
    const send = screen.getByRole("button", { name: "Send" });
    await user.click(send);
    await user.click(send);

    expect(send).toHaveFocus();
    expect(send).toHaveAttribute("aria-disabled", "true");
    expect(send).not.toBeDisabled();
    expect(ratings.saveRating).toHaveBeenCalledTimes(2);
    await act(async () => finish(false));
  });

  it("keeps the comment open when it can't be sent", async () => {
    const user = userEvent.setup();
    renderRating();

    await user.click(notHelpful());
    const box = await screen.findByRole("textbox");
    ratings.saveRating.mockResolvedValue(false);
    await user.type(box, "Bad link");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("textbox")).toHaveValue("Bad link");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Couldn't send your comment. Please try again.",
    );
  });

  it("ignores a late reload result after the person chose", async () => {
    let finish: (r: Record<string, string>) => void = () => {};
    ratings.loadRatings.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    renderRating();

    await user.click(helpful());
    await act(async () => finish({ a1: "not_helpful" }));

    expect(helpful()).toHaveAttribute("aria-pressed", "true");
  });

  it("drops a reload result that arrives after unmount", async () => {
    let finish: (r: Record<string, string>) => void = () => {};
    ratings.loadRatings.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = renderRating();
    unmount();
    await act(async () => finish({ a1: "helpful" }));
  });
});
