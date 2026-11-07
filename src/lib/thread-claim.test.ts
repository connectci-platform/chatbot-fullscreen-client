import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINT_URL = "https://support.access-ci.org/api/agent-token";
const CLAIM_URL = "https://agent.example/api/v1/threads/t1/claim";

const minted = () =>
  new Response(JSON.stringify({ access_token: "t1", expires_in: 900 }), {
    status: 200,
  });

function stubAgent(status: number | Error) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === MINT_URL) return minted();
    if (status instanceof Error) throw status;
    return new Response("{}", { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("thread claim key", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("makes one random key per tab and keeps it across reloads", async () => {
    const first = await import("./thread-claim");
    const key = first.getClaimKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(first.getClaimKey()).toBe(key);

    vi.resetModules();
    const reloaded = await import("./thread-claim");
    expect(reloaded.getClaimKey()).toBe(key);
  });

  it("makes a different key in another tab", async () => {
    const { getClaimKey } = await import("./thread-claim");
    const key = getClaimKey();
    sessionStorage.clear();
    vi.resetModules();
    const other = await import("./thread-claim");
    expect(other.getClaimKey()).not.toBe(key);
  });

  it("still has a stable key when session storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const { getClaimKey } = await import("./thread-claim");
    expect(getClaimKey()).toBe(getClaimKey());
  });

  it("adds the key to a request's headers", async () => {
    const { getClaimKey, withClaimKey } = await import("./thread-claim");
    const init = withClaimKey({ headers: { Accept: "text/plain" } });
    const headers = new Headers(init.headers);
    expect(headers.get("X-Thread-Claim-Key")).toBe(getClaimKey());
    expect(headers.get("Accept")).toBe("text/plain");
  });
});

describe("claimThread", () => {
  beforeEach(() => {
    vi.resetModules();
    sessionStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts the bearer token and key, and reports success", async () => {
    const fetchMock = stubAgent(200);
    const { claimThread, getClaimKey } = await import("./thread-claim");

    await expect(
      claimThread("https://agent.example/api/v1", "t1"),
    ).resolves.toBe(true);

    const call = fetchMock.mock.calls.find(([url]) => url === CLAIM_URL) as
      unknown[] | undefined;
    const init = call?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(headers.get("Authorization")).toBe("Bearer t1");
    expect(headers.get("X-Thread-Claim-Key")).toBe(getClaimKey());
  });

  it("reports false for a conversation that isn't the caller's", async () => {
    stubAgent(404);
    const { claimThread } = await import("./thread-claim");
    await expect(
      claimThread("https://agent.example/api/v1", "t1"),
    ).resolves.toBe(false);
  });

  it("reports false on a network failure", async () => {
    stubAgent(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { claimThread } = await import("./thread-claim");
    await expect(
      claimThread("https://agent.example/api/v1", "t1"),
    ).resolves.toBe(false);
  });
});
