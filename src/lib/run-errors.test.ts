import { describe, it, expect, vi } from "vitest";
import { Client } from "@langchain/langgraph-sdk";
import {
  isNotFound,
  isTurnstileChallenge,
  runErrorMessage,
  runErrorToastOptions,
  shouldReloadAfterSignIn,
  shouldResendAfterSignIn,
  TurnstileChallenge,
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

describe("runErrorToastOptions", () => {
  it("offers a new conversation on a 404 and stays until used", async () => {
    const startNew = vi.fn();

    const options = runErrorToastOptions(await sdkNotFound(), startNew);

    expect(options.duration).toBe(Infinity);
    expect(options.action?.label).toBe("New conversation");
    options.action?.onClick();
    expect(startNew).toHaveBeenCalledOnce();
  });

  it("offers nothing extra for other errors", () => {
    const options = runErrorToastOptions(err("timeout"), vi.fn());

    expect(options.action).toBeUndefined();
    expect(options.duration).toBeUndefined();
  });
});

describe("runErrorMessage", () => {
  it("suggests signing in when a signed-out person gets a 404", async () => {
    expect(runErrorMessage(await sdkNotFound(), "signed_out")).toBe(
      "That conversation isn't available. Start a new one, or sign in if it was yours.",
    );
  });

  it("doesn't suggest signing in to someone already signed in", async () => {
    expect(runErrorMessage(await sdkNotFound(), "signed_in")).toBe(
      "This conversation isn't available. Start a new one.",
    );
  });

  it("treats an unknown sign-in state like signed out", async () => {
    expect(runErrorMessage(await sdkNotFound(), "unknown")).toBe(
      "That conversation isn't available. Start a new one, or sign in if it was yours.",
    );
  });

  it("explains a timeout", () => {
    expect(runErrorMessage(err("timeout"), "signed_in")).toBe(
      "That took too long. Please try again.",
    );
  });

  it("uses the generic message for agent errors", () => {
    expect(runErrorMessage(err("agent_error"), "signed_in")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("does not expose the raw message", () => {
    expect(runErrorMessage(err("StreamError", "boom"), "signed_in")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("uses the generic message for non-Error values", () => {
    expect(runErrorMessage("boom", "signed_in")).toBe(
      "Something went wrong. Please try again.",
    );
  });

  it("shows nothing when the user cancelled", () => {
    expect(runErrorMessage(err("cancelled"), "signed_in")).toBeNull();
    expect(runErrorMessage(err("AbortError"), "signed_in")).toBeNull();
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

describe("TurnstileChallenge", () => {
  it("is recognized and carries the site key", () => {
    const error: unknown = new TurnstileChallenge("site-key");
    expect(isTurnstileChallenge(error)).toBe(true);
    expect((error as TurnstileChallenge).siteKey).toBe("site-key");
  });

  it("isn't confused with other errors", () => {
    expect(isTurnstileChallenge(new Error("boom"))).toBe(false);
    expect(isTurnstileChallenge(undefined)).toBe(false);
  });

  it("shows no error toast, because the challenge panel explains it", () => {
    expect(
      runErrorMessage(new TurnstileChallenge("site-key"), "signed_out"),
    ).toBeNull();
  });
});

describe("shouldResendAfterSignIn", () => {
  const challenge = new TurnstileChallenge("site-key");

  it("resends a challenged question when the person signs in", () => {
    expect(shouldResendAfterSignIn("signed_out", "signed_in", challenge)).toBe(
      true,
    );
  });

  it("resends when the status was unknown after a failed first mint", () => {
    expect(shouldResendAfterSignIn("unknown", "signed_in", challenge)).toBe(
      true,
    );
  });

  it("doesn't resend without a sign-in, so a repeat challenge can't loop", () => {
    expect(shouldResendAfterSignIn("signed_in", "signed_in", challenge)).toBe(
      false,
    );
    expect(shouldResendAfterSignIn("signed_out", "signed_out", challenge)).toBe(
      false,
    );
  });

  it("ignores other errors", () => {
    expect(
      shouldResendAfterSignIn("signed_out", "signed_in", new Error("boom")),
    ).toBe(false);
  });
});
