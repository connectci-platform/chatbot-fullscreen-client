import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Drives the real LangGraph SDK Client through createClient, so the test
// covers how the SDK actually calls onRequest and callerOptions.fetch.

const minted = (token: string) =>
  new Response(
    JSON.stringify({
      access_token: token,
      token_type: "Bearer",
      expires_in: 900,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const MINT_URL = "https://support.access-ci.org/api/agent-token";

function agentCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url) !== MINT_URL);
}

describe("createClient", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("sends the Bearer token and no credentials on SDK requests", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL ? minted("t1") : json(200, []),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");

    await createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    ).threads.search({ limit: 1 });

    const [[, init]] = agentCalls(fetchMock);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer t1");
    expect(init.credentials).toBeUndefined();
  });

  it("re-mints once on a 401 and replays the request", async () => {
    let agentCount = 0;
    let mintCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === MINT_URL) return minted(`t${++mintCount}`);
      return ++agentCount === 1 ? json(401, {}) : json(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");

    await createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    ).threads.search({ limit: 1 });

    const calls = agentCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[1][1].headers).get("Authorization")).toBe(
      "Bearer t2",
    );
    expect(calls[1][1].body).toBe(calls[0][1].body);
  });

  it("doesn't let the SDK retry a 5xx", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL ? minted("t1") : json(502, {}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");

    await expect(
      createClient(
        "https://agent.example/api/v1",
        undefined,
        undefined,
      ).threads.search({ limit: 1 }),
    ).rejects.toBeTruthy();
    expect(agentCalls(fetchMock)).toHaveLength(1);
  });

  it("sends anonymous requests without minting each time when signed out", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL ? json(401, { error: "login_required" }) : json(200, []),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");
    const client = createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    );

    await client.threads.search({ limit: 1 });
    await client.threads.search({ limit: 1 });

    const calls = agentCalls(fetchMock);
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[0][1].headers).get("Authorization")).toBeNull();
    expect(fetchMock.mock.calls.length - calls.length).toBe(1);
  });

  it("keeps anonymous chat working when support can't be reached", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === MINT_URL) throw new TypeError("Failed to fetch");
      return json(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");

    await createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    ).threads.search({ limit: 1 });

    const [[, init]] = agentCalls(fetchMock);
    expect(new Headers(init.headers).get("Authorization")).toBeNull();
  });

  const sse = () =>
    new Response('event: metadata\ndata: {"run_id":"r"}\n\n', {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });

  it("replays a run-creating stream exactly once after a 401", async () => {
    let agentCount = 0;
    let mintCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === MINT_URL) return minted(`t${++mintCount}`);
      return ++agentCount === 1 ? json(401, {}) : sse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");
    const client = createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    );

    for await (const _ of client.runs.stream("th1", "agent", { input: {} })) {
      // drain
    }

    const calls = agentCalls(fetchMock);
    expect(calls.map(([, init]) => init.method)).toEqual(["POST", "POST"]);
    expect(
      calls.map(([, init]) => new Headers(init.headers).get("Authorization")),
    ).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("never resends a run-creating stream after a 5xx", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL ? minted("t1") : json(502, {}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { createClient } = await import("./client");
    const client = createClient(
      "https://agent.example/api/v1",
      undefined,
      undefined,
    );

    await expect(async () => {
      for await (const _ of client.runs.stream("th1", "agent", { input: {} })) {
        // drain
      }
    }).rejects.toBeTruthy();
    expect(agentCalls(fetchMock)).toHaveLength(1);
  });
});
