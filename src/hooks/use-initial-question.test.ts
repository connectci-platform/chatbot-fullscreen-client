import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import {
  withNuqsTestingAdapter,
  type UrlUpdateEvent,
} from "nuqs/adapters/testing";
import {
  useInitialQuestion,
  MAX_INITIAL_QUESTION_LENGTH,
} from "./use-initial-question";

function setup(searchParams: string) {
  const onQuestion = vi.fn();
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>();
  const hook = renderHook(() => useInitialQuestion(onQuestion), {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }),
  });
  const lastSearch = () =>
    onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.toString();
  return { onQuestion, onUrlUpdate, lastSearch, ...hook };
}

describe("useInitialQuestion", () => {
  it("submits ?q= once and strips it from the URL", async () => {
    const { onQuestion, lastSearch } = setup("?q=How%20do%20I%20log%20in%3F");
    await waitFor(() => expect(onQuestion).toHaveBeenCalledTimes(1));
    expect(onQuestion).toHaveBeenCalledWith("How do I log in?");
    await waitFor(() => expect(lastSearch()).toBe(""));
  });

  it("decodes + as a space, as a GET form submits it", async () => {
    const { onQuestion } = setup("?q=What+GPUs+are+on+Delta%3F");
    await waitFor(() =>
      expect(onQuestion).toHaveBeenCalledWith("What GPUs are on Delta?"),
    );
  });

  it("keeps other params when stripping q", async () => {
    const { lastSearch } = setup("?q=hello&hideToolCalls=true");
    await waitFor(() => expect(lastSearch()).toBe("hideToolCalls=true"));
  });

  it("ignores a blank question but still strips it", async () => {
    const { onQuestion, lastSearch } = setup("?q=%20%20");
    await waitFor(() => expect(lastSearch()).toBe(""));
    expect(onQuestion).not.toHaveBeenCalled();
  });

  it("trims and caps the question length", async () => {
    const long = "a".repeat(MAX_INITIAL_QUESTION_LENGTH + 50);
    const { onQuestion } = setup(`?q=${encodeURIComponent(`  ${long}  `)}`);
    await waitFor(() => expect(onQuestion).toHaveBeenCalledTimes(1));
    expect(onQuestion.mock.calls[0][0]).toBe(
      "a".repeat(MAX_INITIAL_QUESTION_LENGTH),
    );
  });

  it("does not submit into an existing thread", async () => {
    const { onQuestion, lastSearch } = setup("?q=hello&threadId=t-1");
    await waitFor(() => expect(lastSearch()).toBe("threadId=t-1"));
    expect(onQuestion).not.toHaveBeenCalled();
  });

  it("does not submit alongside a handoff token", async () => {
    const { onQuestion, lastSearch } = setup("?q=hello&h=tok");
    await waitFor(() => expect(lastSearch()).toBe("h=tok"));
    expect(onQuestion).not.toHaveBeenCalled();
  });

  it("does nothing without q", async () => {
    const { onQuestion, onUrlUpdate } = setup("?threadId=t-1");
    await new Promise((r) => setTimeout(r, 50));
    expect(onQuestion).not.toHaveBeenCalled();
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it("does not resubmit on re-render", async () => {
    const { onQuestion, rerender } = setup("?q=hello");
    await waitFor(() => expect(onQuestion).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    await new Promise((r) => setTimeout(r, 50));
    expect(onQuestion).toHaveBeenCalledTimes(1);
  });
});
