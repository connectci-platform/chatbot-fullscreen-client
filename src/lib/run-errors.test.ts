import { describe, it, expect } from "vitest";
import { Client } from "@langchain/langgraph-sdk";
import { runErrorMessage } from "./run-errors";

const err = (name: string, message = "") =>
  Object.assign(new Error(message), { name });

// The error a real SDK client throws for a 404 on the history call.
async function sdkNotFound(): Promise<unknown> {
  const client = new Client({
    apiUrl: "https://agent.example/api/v1",
    callerOptions: {
      maxRetries: 0,
      fetch: async () => new Response("Not Found", { status: 404 }),
    },
  });
  return client.threads.getHistory("t-1").then(
    () => {
      throw new Error("expected a rejection");
    },
    (error: unknown) => error,
  );
}

describe("runErrorMessage", () => {
  it("says an unreadable conversation isn't available on a 404", async () => {
    expect(runErrorMessage(await sdkNotFound())).toBe(
      "That conversation isn't available. Sign in, or start a new conversation.",
    );
  });

  it("explains a timeout", () => {
    expect(runErrorMessage(err("timeout"))).toBe(
      "That took too long. Please try again.",
    );
  });

  it("uses the generic message for agent errors", () => {
    expect(runErrorMessage(err("agent_error"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("does not expose the raw message", () => {
    expect(runErrorMessage(err("StreamError", "boom"))).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("uses the generic message for non-Error values", () => {
    expect(runErrorMessage("boom")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("shows nothing when the user cancelled", () => {
    expect(runErrorMessage(err("cancelled"))).toBeNull();
    expect(runErrorMessage(err("AbortError"))).toBeNull();
  });
});
