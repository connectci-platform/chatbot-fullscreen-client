import { fireEvent, render, screen, within } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";
import { chartViewsByMessage } from "@/lib/xdmod-chart";
import { showChart } from "../xdmod-chart-panel";
import { COMPOSER_ID } from "../composer";
import { AssistantMessage, AssistantMessageLoading } from "./ai";

const toolMessage: Message = {
  id: "tool-1",
  type: "tool",
  tool_call_id: "call-1",
  content: "secret tool output",
};

const aiMessage: Message = {
  id: "ai-1",
  type: "ai",
  content: "Hello from the assistant",
};

const stream: {
  messages: Message[];
  interrupt: unknown;
} = { messages: [], interrupt: undefined };

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({
    messages: stream.messages,
    values: {},
    interrupt: stream.interrupt,
  }),
}));

vi.mock("../artifact", () => ({ useArtifact: () => [null, vi.fn()] }));

vi.mock("../xdmod-chart-panel", () => ({ showChart: vi.fn() }));

vi.mock("./answer-rating", () => ({
  AnswerRating: ({ message }: { message: Message }) => (
    <div data-testid="rating">{message.id}</div>
  ),
}));

/** Renders the message with its chart key, as the thread passes it. */
function renderMessage(message: Message, searchParams = "") {
  const chartKey = message.id
    ? chartViewsByMessage(stream.messages).get(message.id)?.[0]?.key
    : undefined;
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <AssistantMessage
        message={message}
        isLoading={false}
        chartKey={chartKey}
      />
    </NuqsTestingAdapter>,
  );
}

describe("AssistantMessage", () => {
  beforeEach(() => {
    stream.messages = [toolMessage];
    stream.interrupt = undefined;
  });

  it("keeps tool messages hidden with ?hideToolCalls=false", () => {
    renderMessage(toolMessage, "?hideToolCalls=false");
    expect(screen.queryByText("secret tool output")).toBeNull();
  });

  it("offers Copy but not Regenerate", () => {
    stream.messages = [aiMessage];
    renderMessage(aiMessage);
    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy content" })).toBeTruthy();
  });

  it("offers a rating under an answer with text", () => {
    stream.messages = [aiMessage];
    renderMessage(aiMessage);
    expect(screen.getByTestId("rating").textContent).toBe("ai-1");
  });

  it("has no Copy button when the message has no text", () => {
    const toolCallMessage: Message = { id: "ai-2", type: "ai", content: "" };
    stream.messages = [toolCallMessage];
    renderMessage(toolCallMessage);
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
    expect(screen.queryByTestId("rating")).toBeNull();
  });

  it("still renders an interrupt for the last AI message", () => {
    stream.messages = [aiMessage];
    stream.interrupt = { value: { reason: "needs approval" } };
    renderMessage(aiMessage);
    expect(screen.getByText(/needs approval/)).toBeTruthy();
  });

  it("lists the documentation sources an answer links", () => {
    const url = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const search: Message = {
      id: "tool-2",
      type: "tool",
      tool_call_id: "call-2",
      name: "search_access_documents",
      content: `Retrieved 1 documentation excerpt(s).\n\n[1] source: ${url}\nUse Globus.`,
    };
    const answer: Message = {
      id: "ai-3",
      type: "ai",
      content: `See the [user guide](${url}).`,
    };
    stream.messages = [search, answer];
    renderMessage(answer);
    expect(screen.getByRole("button", { name: /User guide/ })).toBeTruthy();
  });

  describe("with a sources list the model wrote", () => {
    const url = "https://www.psc.edu/resources/bridges-2/user-guide/";
    const search: Message = {
      id: "tool-5",
      type: "tool",
      tool_call_id: "call-5",
      name: "search_access_documents",
      content: `Retrieved 1 documentation excerpt(s).\n\n[1] source: ${url}\nUse Globus.`,
    };
    const answerWith = (text: string): Message => ({
      id: "ai-6",
      type: "ai",
      content: text,
    });

    it("shows only the chips when the list links nothing else", () => {
      const answer = answerWith(
        `Use Globus.\n\n**Sources:**\n- [Bridges-2 user guide](${url})`,
      );
      stream.messages = [search, answer];
      renderMessage(answer);
      expect(screen.getByText("Use Globus.")).toBeTruthy();
      expect(screen.queryByText(/Sources:/)).toBeNull();
      expect(
        screen.queryByRole("link", { name: "Bridges-2 user guide" }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: /User guide/ })).toBeTruthy();
    });

    it("moves a page only the list links into the chips", () => {
      const answer = answerWith(
        `Use Globus.\n\n**Sources:**\n- [Bridges-2 user guide](${url})\n- [Globus](https://www.globus.org/docs/how-to/)`,
      );
      stream.messages = [search, answer];
      renderMessage(answer);
      expect(screen.queryByText(/Sources:/)).toBeNull();
      const list = screen.getByRole("list", { name: "Sources" });
      const extra = within(list).getByRole("link", { name: /How to/ });
      expect(extra.getAttribute("href")).toBe(
        "https://www.globus.org/docs/how-to/",
      );
      expect(extra.getAttribute("title")).toBe("Docs › How to");
      expect(
        within(list).getByRole("button", { name: /User guide/ }),
      ).toBeTruthy();
    });

    it("keeps the list while the answer streams, before the chips show", () => {
      const answer = answerWith(`Use Globus.\n\nSources:\n- [guide](${url})`);
      stream.messages = [search, answer];
      render(
        <NuqsTestingAdapter>
          <AssistantMessage
            message={answer}
            isLoading
          />
        </NuqsTestingAdapter>,
      );
      expect(screen.getByRole("link", { name: "guide" })).toBeTruthy();
    });
  });

  it("shows the model's note before a tool call as a status line, not an answer", () => {
    const narration: Message = {
      id: "ai-7",
      type: "ai",
      content: "Let me first check the documentation for Delta.",
      tool_calls: [{ id: "call-7", name: "search_access_documents", args: {} }],
    };
    stream.messages = [narration];
    renderMessage(narration);
    const line = screen.getByText(
      "Let me first check the documentation for Delta.",
    );
    expect(line.tagName).toBe("P");
    expect(line.className).toContain("text-muted-foreground");
    expect(screen.queryByTestId("rating")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy content" })).toBeNull();
  });

  it("keeps text before a tool that changes something as an answer", () => {
    const message: Message = {
      id: "ai-9",
      type: "ai",
      content: "I'll **cancel** your Globus workshop registration.",
      tool_calls: [{ id: "call-9", name: "cancel_registration", args: {} }],
    };
    stream.messages = [message];
    renderMessage(message);
    expect(screen.getByText("cancel").tagName).toBe("STRONG");
    expect(screen.getByTestId("rating")).toBeTruthy();
  });

  it("shows a status line's markdown as plain text", () => {
    const narration: Message = {
      id: "ai-10",
      type: "ai",
      content: "Let me check the **Delta** documentation.",
      tool_calls: [
        { id: "call-10", name: "search_access_documents", args: {} },
      ],
    };
    stream.messages = [narration];
    renderMessage(narration);
    expect(
      screen.getByText("Let me check the Delta documentation."),
    ).toBeTruthy();
  });

  it("keeps real content written before a tool call as an answer", () => {
    const text =
      "Delta has CPU and GPU partitions.\n\nLet me check which one fits.";
    const message: Message = {
      id: "ai-8",
      type: "ai",
      content: text,
      tool_calls: [{ id: "call-8", name: "search_access_documents", args: {} }],
    };
    stream.messages = [message];
    renderMessage(message);
    expect(screen.getByText("Delta has CPU and GPU partitions.")).toBeTruthy();
    expect(screen.getByTestId("rating")).toBeTruthy();
  });

  describe("with an XDMoD chart", () => {
    const chart = {
      version: 1,
      realm: "Jobs",
      statistic: "total_cpu_hours",
      group_by: "none",
      dataset_type: "timeseries",
      unit: "Month",
      requested: { start: "2026-08-01", end: "2026-09-30" },
      counted: { start: "2026-08-01", end: "2026-09-30" },
      last_period_incomplete: false,
      measure: {
        label: "CPU Hours: Total",
        description: "Total CPU hours.",
        kind: "total",
        missing: "zero",
      },
      dimension: { name: "none", ordered: false },
      filters: { notes: [] },
      series: [
        {
          name: "All",
          points: [
            { start: "2026-08-01", value: 1 },
            { start: "2026-09-01", value: 2 },
          ],
        },
      ],
      has_more: false,
      ranked_by: "value",
      link: "https://xdmod.access-ci.org/",
      source: "XDMoD",
      retrieved: "2026-11-09",
    };
    const history = [
      { id: "h-1", type: "human", content: "How many CPU hours?" },
      {
        id: "tool-3",
        type: "tool",
        name: "get_chart_data",
        tool_call_id: "chart-call",
        content: "CPU hours by month",
        artifact: { structured_content: { chart } },
      },
      { id: "ai-4", type: "ai", content: "Here are the CPU hours." },
    ] as unknown as Message[];

    it("offers a chip that opens the answer's chart", () => {
      stream.messages = history;
      renderMessage(history[2]);
      fireEvent.click(screen.getByRole("button", { name: "Show chart" }));
      expect(showChart).toHaveBeenCalledWith("chart-call");
    });

    it("keeps the chip on a reopened thread's earlier answer", () => {
      stream.messages = [
        ...history,
        { id: "h-2", type: "human", content: "Thanks" },
        { id: "ai-5", type: "ai", content: "You're welcome." },
      ] as Message[];
      renderMessage(history[2]);
      expect(screen.getByRole("button", { name: "Show chart" })).toBeTruthy();
    });

    it("opens a two-chart answer on its first chart", () => {
      const both = [
        history[0],
        {
          id: "ai-calls",
          type: "ai",
          content: "",
          tool_calls: [
            { id: "first-call", name: "get_chart_data", args: {} },
            { id: "chart-call", name: "get_chart_data", args: {} },
          ],
        },
        // The second call finished first.
        history[1],
        { ...history[1], id: "tool-4", tool_call_id: "first-call" },
        history[2],
      ] as unknown as Message[];
      stream.messages = both;
      renderMessage(history[2]);
      fireEvent.click(screen.getByRole("button", { name: "Show chart" }));
      expect(showChart).toHaveBeenLastCalledWith("first-call");
    });

    it("has no chip on an answer without a chart", () => {
      stream.messages = [
        ...history,
        { id: "h-3", type: "human", content: "Hi" } as Message,
        aiMessage,
      ];
      renderMessage(aiMessage);
      expect(screen.queryByRole("button", { name: "Show chart" })).toBeNull();
    });
  });

  describe("with suggested questions", () => {
    const question: Message = { id: "h-q", type: "human", content: "Hi" };
    const withNext = (id: string, questions: unknown): Message =>
      ({
        id,
        type: "ai",
        content: "Here's how.",
        additional_kwargs: { suggested_questions: questions },
      }) as Message;
    const ask = (
      message: Message,
      isLoading = false,
      awaitingCheck = false,
    ) => {
      const onAsk = vi.fn();
      render(
        <NuqsTestingAdapter>
          <AssistantMessage
            message={message}
            isLoading={isLoading}
            onAsk={onAsk}
            awaitingCheck={awaitingCheck}
          />
          <textarea
            id={COMPOSER_ID}
            aria-label="Message"
          />
        </NuqsTestingAdapter>,
      );
      return onAsk;
    };

    it("offers them under the latest answer as buttons", () => {
      const answer = withNext("ai-n", ["What is Delta?", "How do I log in?"]);
      stream.messages = [question, answer];
      ask(answer);
      const next = screen.getByRole("region", { name: "Ask next" });
      expect(
        within(next)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["What is Delta?", "How do I log in?"]);
    });

    it("sends the question when one is clicked", () => {
      const answer = withNext("ai-n", ["What is Delta?"]);
      stream.messages = [question, answer];
      const onAsk = ask(answer);
      fireEvent.click(screen.getByRole("button", { name: "What is Delta?" }));
      expect(onAsk).toHaveBeenCalledWith("What is Delta?");
    });

    it("moves focus to the message box after asking", () => {
      const answer = withNext("ai-n", ["What is Delta?"]);
      stream.messages = [question, answer];
      ask(answer);
      const button = screen.getByRole("button", { name: "What is Delta?" });
      button.focus();
      fireEvent.click(button);
      expect(document.activeElement).toBe(
        screen.getByRole("textbox", { name: "Message" }),
      );
    });

    it("sends nothing while the Turnstile check is showing", () => {
      const answer = withNext("ai-n", ["What is Delta?"]);
      stream.messages = [question, answer];
      const onAsk = ask(answer, false, true);
      const button = screen.getByRole("button", { name: "What is Delta?" });
      expect(button.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(button);
      expect(onAsk).not.toHaveBeenCalled();
    });

    it("offers none on a capability answer with no examples", () => {
      const overview = {
        id: "ai-cap",
        type: "ai",
        content: "I can help with these.",
        additional_kwargs: {
          capability_overview: true,
          suggestions: [],
          suggested_questions: ["What is Delta?"],
        },
      } as Message;
      stream.messages = [question, overview];
      ask(overview);
      expect(screen.queryByText("Ask next")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "What is Delta?" }),
      ).toBeNull();
    });

    it("drops them from an earlier answer", () => {
      const earlier = withNext("ai-old", ["What is Delta?"]);
      stream.messages = [
        question,
        earlier,
        { id: "h-2", type: "human", content: "Thanks" },
        withNext("ai-new", ["What is Anvil?"]),
      ];
      ask(earlier);
      expect(screen.queryByText("Ask next")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "What is Delta?" }),
      ).toBeNull();
    });

    it("drops them once a newer question is asked", () => {
      const answer = withNext("ai-n", ["What is Delta?"]);
      stream.messages = [
        question,
        answer,
        { id: "h-2", type: "human", content: "Next" },
      ];
      ask(answer);
      expect(screen.queryByText("Ask next")).toBeNull();
    });

    it("hides them while loading", () => {
      const answer = withNext("ai-n", ["What is Delta?"]);
      stream.messages = [question, answer];
      ask(answer, true);
      expect(screen.queryByText("Ask next")).toBeNull();
    });

    it("shows nothing for an answer without them", () => {
      const answer: Message = { id: "ai-n", type: "ai", content: "Done." };
      stream.messages = [question, answer];
      ask(answer);
      expect(screen.queryByText("Ask next")).toBeNull();
    });

    it("keeps the capability answer's own examples instead", () => {
      const overview = {
        id: "ai-cap",
        type: "ai",
        content: "I can help with these.",
        additional_kwargs: {
          capability_overview: true,
          suggestions: ["Find software on Delta"],
          suggested_questions: ["What is Delta?"],
        },
      } as Message;
      stream.messages = [question, overview];
      ask(overview);
      expect(
        screen.getByRole("region", { name: "Try one of these" }),
      ).toBeTruthy();
      expect(
        screen.getByRole("button", { name: "Find software on Delta" }),
      ).toBeTruthy();
      expect(screen.queryByText("Ask next")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "What is Delta?" }),
      ).toBeNull();
    });
  });

  it("shows the agent's status while it works", () => {
    render(<AssistantMessageLoading status="Searching software..." />);
    expect(screen.getByRole("status").textContent).toContain(
      "Searching software...",
    );
  });

  it("announces a default when there is no status yet", () => {
    render(<AssistantMessageLoading />);
    expect(screen.getByRole("status").textContent).toContain(
      "Writing an answer…",
    );
  });
});
