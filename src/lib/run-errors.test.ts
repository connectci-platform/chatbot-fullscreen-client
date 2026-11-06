import { describe, it, expect } from "vitest";
import { Client } from "@langchain/langgraph-sdk";
import {
  isNotFound,
  runErrorMessage,
  shouldReloadAfterSignIn,
} from "./run-errors";

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
      "That conversation isn't available. Start a new one, or sign in if it was yours.",
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

describe("shouldReloadAfterSignIn", () => {
  const notFound = Object.assign(new Error("Not Found"), { status: 404 });
  const serverError = Object.assign(new Error("boom"), { status: 500 });

  it("is true for signed_out to signed_in with a not-found error", () => {
    expect(shouldReloadAfterSignIn("signed_out", "signed_in", notFound)).toBe(
      true,
    );
  });

  it("is false without an error", () => {
    expect(shouldReloadAfterSignIn("signed_out", "signed_in", undefined)).toBe(
      false,
    );
  });

  it("is false for a 500", () => {
    expect(
      shouldReloadAfterSignIn("signed_out", "signed_in", serverError),
    ).toBe(false);
  });

  it("is false when the status was unknown before", () => {
    expect(shouldReloadAfterSignIn("unknown", "signed_in", notFound)).toBe(
      false,
    );
  });

  it("is false when already signed in", () => {
    expect(shouldReloadAfterSignIn("signed_in", "signed_in", notFound)).toBe(
      false,
    );
  });

  it("isNotFound recognises only a 404", () => {
    expect(isNotFound(notFound)).toBe(true);
    expect(isNotFound(serverError)).toBe(false);
    expect(isNotFound("x")).toBe(false);
  });
});
