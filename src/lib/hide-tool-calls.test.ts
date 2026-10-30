import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useQueryState } from "nuqs";
import {
  withNuqsTestingAdapter,
  type UrlUpdateEvent,
} from "nuqs/adapters/testing";
import { hideToolCallsParser } from "./hide-tool-calls";

function setup(searchParams: string) {
  const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>();
  const hook = renderHook(
    () => useQueryState("hideToolCalls", hideToolCallsParser),
    { wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate }) },
  );
  return { onUrlUpdate, ...hook };
}

describe("hideToolCallsParser", () => {
  it("hides tool calls when the URL says nothing", () => {
    const { result } = setup("");
    expect(result.current[0]).toBe(true);
  });

  it("shows tool calls when the URL turns them on", () => {
    const { result } = setup("?hideToolCalls=false");
    expect(result.current[0]).toBe(false);
  });

  it("records showing tool calls in the URL", async () => {
    const { result, onUrlUpdate } = setup("");
    act(() => {
      result.current[1](false);
    });
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.toString()).toBe(
        "hideToolCalls=false",
      ),
    );
  });
});
