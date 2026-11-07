import { describe, it, expect, vi } from "vitest";
import { Client } from "@langchain/langgraph-sdk";
import { authorize, createAgentFetch } from "./agent-fetch";
import type { AgentTokenSource } from "./agent-token";
import { TurnstileChallenge } from "./run-errors";

function fakeSource(token: string | null, refreshed: string | null = "t2") {
  return {
    getToken: vi.fn().mockResolvedValue(token),
    refresh: vi.fn().mockResolvedValue(refreshed),
    getStatus: () => "unknown" as const,
    subscribe: () => () => {},
  } satisfies AgentTokenSource;
}

const status = (code: number) => ({ status: code, ok: code < 400 }) as Response;

function authOf(init: RequestInit | undefined) {
  return new Headers(init?.headers).get("Authorization");
}

describe("authorize", () => {
  it("adds the Bearer token and keeps other headers", async () => {
    const init = await authorize(fakeSource("t1"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    expect(authOf(init)).toBe("Bearer t1");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(init.credentials).toBeUndefined();
  });

  it("sends no Authorization header when signed out", async () => {
    const init = await authorize(fakeSource(null), {
      headers: { Authorization: "Bearer old" },
    });
    expect(authOf(init)).toBeNull();
  });

  it("propagates a mint failure so the request isn't sent", async () => {
    const source = fakeSource("t1");
    source.getToken.mockRejectedValue(new Error("mint failed"));
    await expect(authorize(source)).rejects.toThrow("mint failed");
  });
});

describe("createAgentFetch", () => {
  it("passes through anything but a 401", async () => {
    const source = fakeSource("t1");
    const fetchImpl = vi.fn().mockResolvedValue(status(500));
    const res = await createAgentFetch(source, fetchImpl)("u", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(res.status).toBe(500);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(source.refresh).not.toHaveBeenCalled();
  });

  it("re-mints once on a 401 and replays with the new token", async () => {
    const source = fakeSource("t1", "t2");
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(401))
      .mockResolvedValueOnce(status(200));
    const res = await createAgentFetch(source, fetchImpl)("u", {
      method: "POST",
      headers: { Authorization: "Bearer t1" },
      body: '{"a":1}',
    });
    expect(res.status).toBe(200);
    expect(source.refresh).toHaveBeenCalledWith("t1");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const replay = fetchImpl.mock.calls[1][1] as RequestInit;
    expect(authOf(replay)).toBe("Bearer t2");
    expect(replay.body).toBe('{"a":1}');
  });

  it("returns the second 401 instead of retrying again", async () => {
    const source = fakeSource("t1", "t2");
    const fetchImpl = vi.fn().mockResolvedValue(status(401));
    const res = await createAgentFetch(source, fetchImpl)("u", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("doesn't replay when the re-mint says signed out", async () => {
    const source = fakeSource("t1", null);
    const fetchImpl = vi.fn().mockResolvedValue(status(401));
    const res = await createAgentFetch(source, fetchImpl)("u", {
      headers: { Authorization: "Bearer t1" },
    });
    expect(res.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("doesn't re-mint for a 401 to a request that sent no token", async () => {
    const source = fakeSource(null);
    const fetchImpl = vi.fn().mockResolvedValue(status(401));
    await createAgentFetch(source, fetchImpl)("u", {});
    expect(source.refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("doesn't replay a body that can't be sent twice", async () => {
    const source = fakeSource("t1");
    const fetchImpl = vi.fn().mockResolvedValue(status(401));
    await createAgentFetch(source, fetchImpl)("u", {
      headers: { Authorization: "Bearer t1" },
      body: new ReadableStream(),
    });
    expect(source.refresh).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("createAgentFetch run challenges", () => {
  const RUN_URL = "https://agent.test/api/v1/threads/t-1/runs/stream";
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json" },
    });
  const challenge = () =>
    json({ requires_turnstile: true, site_key: "site-key" });

  it("turns the agent's challenge into a TurnstileChallenge", async () => {
    const agentFetch = createAgentFetch(fakeSource(null), async () =>
      challenge(),
    );
    await expect(agentFetch(RUN_URL)).rejects.toMatchObject({
      name: "TurnstileChallenge",
      siteKey: "site-key",
    });
  });

  it("reaches the caller of a real SDK stream unchanged", async () => {
    const client = new Client({
      apiUrl: "https://agent.test/api/v1",
      callerOptions: {
        maxRetries: 0,
        fetch: createAgentFetch(fakeSource(null), async () => challenge()),
      },
    });
    const consume = async () => {
      for await (const _ of client.runs.stream("t-1", "agent")) void _;
    };
    await expect(consume()).rejects.toBeInstanceOf(TurnstileChallenge);
  });

  it("leaves an event stream unread", async () => {
    const res = new Response("event: metadata\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
    const agentFetch = createAgentFetch(fakeSource(null), async () => res);
    expect(await agentFetch(RUN_URL)).toBe(res);
    expect(res.bodyUsed).toBe(false);
  });

  it("returns other JSON from the run route, still readable", async () => {
    const agentFetch = createAgentFetch(fakeSource(null), async () =>
      json({ detail: "A run is already active on this thread" }),
    );
    const res = await agentFetch(RUN_URL);
    expect(await res.json()).toEqual({
      detail: "A run is already active on this thread",
    });
  });

  it("returns a JSON body that can't be parsed", async () => {
    const res = new Response("not json", {
      headers: { "Content-Type": "application/json" },
    });
    const agentFetch = createAgentFetch(fakeSource(null), async () => res);
    expect(await agentFetch(RUN_URL)).toBe(res);
  });

  it("doesn't read responses from other routes", async () => {
    const res = challenge();
    const agentFetch = createAgentFetch(fakeSource(null), async () => res);
    expect(await agentFetch("https://agent.test/api/v1/threads")).toBe(res);
  });
});
