import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINT_URL = "https://support.access-ci.org/api/agent-token";
const API = "https://agent.example/api/v1";

const minted = () =>
  new Response(JSON.stringify({ access_token: "t1", expires_in: 900 }), {
    status: 200,
  });

function stubAgent(reply: () => Response) {
  const fetchMock = vi.fn(async (url: string) =>
    url === MINT_URL ? minted() : reply(),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function agentCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => url !== MINT_URL) as [
    string,
    RequestInit,
  ][];
}

describe("deleting conversations", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("deletes one conversation with the token and the claim key", async () => {
    localStorage.setItem("thread-claim-key", "k".repeat(32));
    const fetchMock = stubAgent(() => new Response(null, { status: 204 }));
    const { deleteConversation } = await import("./conversations");

    await deleteConversation(API, "t/1");

    const [[url, init]] = agentCalls(fetchMock);
    expect(url).toBe(`${API}/threads/t%2F1`);
    expect(init.method).toBe("DELETE");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer t1");
    expect(headers.get("X-Thread-Claim-Key")).toBe("k".repeat(32));
  });

  it("deletes all and says how many", async () => {
    const fetchMock = stubAgent(
      () => new Response(JSON.stringify({ deleted: 3 }), { status: 200 }),
    );
    const { deleteAllConversations } = await import("./conversations");

    await expect(deleteAllConversations(API)).resolves.toBe(3);
    const [[url, init]] = agentCalls(fetchMock);
    expect(url).toBe(`${API}/me/conversations`);
    expect(init.method).toBe("DELETE");
  });

  it("says to wait while an answer is still being written", async () => {
    stubAgent(() => new Response("{}", { status: 409 }));
    const { deleteConversation } = await import("./conversations");

    await expect(deleteConversation(API, "t1")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("still being written"),
    });
  });

  it("reports any other failure plainly", async () => {
    stubAgent(() => new Response("{}", { status: 503 }));
    const { deleteAllConversations } = await import("./conversations");

    await expect(deleteAllConversations(API)).rejects.toMatchObject({
      status: 503,
      message: "Couldn't delete. Try again.",
    });
  });

  it("reads a reply without a count as zero", async () => {
    stubAgent(() => new Response("not json", { status: 200 }));
    const { deleteAllConversations } = await import("./conversations");

    await expect(deleteAllConversations(API)).resolves.toBe(0);
  });
});
