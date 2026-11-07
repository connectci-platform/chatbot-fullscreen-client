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
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("makes one random key per browser and keeps it across restarts", async () => {
    const first = await import("./thread-claim");
    const key = first.getClaimKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(first.getClaimKey()).toBe(key);

    vi.resetModules();
    const restarted = await import("./thread-claim");
    expect(restarted.getClaimKey()).toBe(key);
  });

  it("shares the key with another tab", async () => {
    const tab = await import("./thread-claim");
    const key = tab.getClaimKey();

    vi.resetModules();
    const otherTab = await import("./thread-claim");

    expect(otherTab.getClaimKey()).toBe(key);
  });

  it("makes a new key after sign-out clears it", async () => {
    const { clearClaimKey, getClaimKey } = await import("./thread-claim");
    const key = getClaimKey();

    clearClaimKey();

    expect(localStorage.length).toBe(0);
    expect(getClaimKey()).not.toBe(key);
  });

  it("notices a sign-out in another tab", async () => {
    const { getClaimKey } = await import("./thread-claim");
    const key = getClaimKey();

    localStorage.clear();

    expect(getClaimKey()).not.toBe(key);
  });

  describe("with storage unavailable", () => {
    beforeEach(() => {
      const blocked = () => {
        throw new Error("blocked");
      };
      vi.stubGlobal("localStorage", {
        getItem: blocked,
        setItem: blocked,
        removeItem: blocked,
      });
    });

    it("keeps a stable key for the page", async () => {
      const { getClaimKey } = await import("./thread-claim");
      expect(getClaimKey()).toBe(getClaimKey());
    });

    it("still clears the key on sign-out", async () => {
      const { clearClaimKey, getClaimKey } = await import("./thread-claim");
      const key = getClaimKey();

      clearClaimKey();

      expect(getClaimKey()).not.toBe(key);
    });
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
    localStorage.clear();
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
