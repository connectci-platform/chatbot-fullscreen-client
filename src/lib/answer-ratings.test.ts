import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@langchain/langgraph-sdk";

const MINT_URL = "https://support.access-ci.org/api/agent-token";
const API = "https://agent.example/api/v1";

const minted = () =>
  new Response(JSON.stringify({ access_token: "t1", expires_in: 900 }), {
    status: 200,
  });

function stubAgent(reply: (url: string) => Response | Error) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === MINT_URL) return minted();
    const r = reply(url);
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function agentCall(fetchMock: ReturnType<typeof vi.fn>) {
  const call = fetchMock.mock.calls.find(([url]) => url !== MINT_URL) as
    [string, RequestInit] | undefined;
  if (!call) throw new Error("no agent call");
  return call;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

describe("saveRating", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("puts the rating with the token and claim key", async () => {
    const fetchMock = stubAgent(() => json(200, {}));
    const { saveRating } = await import("./answer-ratings");
    const { getClaimKey } = await import("./thread-claim");

    await expect(
      saveRating(API, "t 1", "lc_run--a1", "not_helpful", "wrong host"),
    ).resolves.toBe(true);

    const [url, init] = agentCall(fetchMock);
    expect(url).toBe(`${API}/threads/t%201/messages/lc_run--a1/rating`);
    expect(init.method).toBe("PUT");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer t1");
    expect(headers.get("X-Thread-Claim-Key")).toBe(getClaimKey());
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      rating: "not_helpful",
      feedback: "wrong host",
    });
  });

  it("sends no feedback field without a comment", async () => {
    const fetchMock = stubAgent(() => json(200, {}));
    const { saveRating } = await import("./answer-ratings");

    await saveRating(API, "t1", "a1", "helpful");

    expect(JSON.parse(agentCall(fetchMock)[1].body as string)).toEqual({
      rating: "helpful",
    });
  });

  it("reports false when the agent refuses", async () => {
    stubAgent(() => json(404, {}));
    const { saveRating } = await import("./answer-ratings");
    await expect(saveRating(API, "t1", "a1", "helpful")).resolves.toBe(false);
  });

  it("reports false on a network failure", async () => {
    stubAgent(() => new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { saveRating } = await import("./answer-ratings");
    await expect(saveRating(API, "t1", "a1", "helpful")).resolves.toBe(false);
  });

  it("updates what a later load sees", async () => {
    const fetchMock = stubAgent((url) =>
      url.endsWith("/ratings") ? json(200, { ratings: {} }) : json(200, {}),
    );
    const { loadRatings, saveRating } = await import("./answer-ratings");

    await loadRatings(API, "t1");
    await saveRating(API, "t1", "a1", "helpful");

    await expect(loadRatings(API, "t1")).resolves.toEqual({ a1: "helpful" });
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/ratings")),
    ).toHaveLength(1);
  });
});

describe("loadRatings", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the thread's ratings once for every answer", async () => {
    const fetchMock = stubAgent(() =>
      json(200, { ratings: { a1: "helpful", a2: "not_helpful", a3: "meh" } }),
    );
    const { loadRatings } = await import("./answer-ratings");

    const [first, second] = await Promise.all([
      loadRatings(API, "t1"),
      loadRatings(API, "t1"),
    ]);

    expect(first).toEqual({ a1: "helpful", a2: "not_helpful" });
    expect(second).toBe(first);
    const [url, init] = agentCall(fetchMock);
    expect(url).toBe(`${API}/threads/t1/ratings`);
    expect(new Headers(init.headers).get("X-Thread-Claim-Key")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([u]) => u !== MINT_URL)).toHaveLength(
      1,
    );
  });

  it("is empty when the agent can't say, and asks again next time", async () => {
    const fetchMock = stubAgent(() => json(503, {}));
    const { loadRatings } = await import("./answer-ratings");

    await expect(loadRatings(API, "t1")).resolves.toEqual({});
    await loadRatings(API, "t1");

    expect(fetchMock.mock.calls.filter(([u]) => u !== MINT_URL)).toHaveLength(
      2,
    );
  });

  it("is empty on a malformed body or a network failure", async () => {
    stubAgent(() => json(200, { ratings: ["a1"] }));
    const { loadRatings } = await import("./answer-ratings");
    await expect(loadRatings(API, "t1")).resolves.toEqual({});

    vi.resetModules();
    stubAgent(() => new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const again = await import("./answer-ratings");
    await expect(again.loadRatings(API, "t2")).resolves.toEqual({});
  });
});

describe("isTurnAnswer", () => {
  const messages: Message[] = [
    { id: "h1", type: "human", content: "q1" },
    { id: "call", type: "ai", content: "" },
    { id: "interim", type: "ai", content: "Checking." },
    { id: "a1", type: "ai", content: "Answer one." },
    { id: "h2", type: "human", content: "q2" },
    { id: "a2", type: "ai", content: [{ type: "text", text: "Two." }] },
  ];

  it("is the last answer with text before the next question", async () => {
    const { isTurnAnswer } = await import("./answer-ratings");
    expect(isTurnAnswer(messages, "a1")).toBe(true);
    expect(isTurnAnswer(messages, "a2")).toBe(true);
    expect(isTurnAnswer(messages, "interim")).toBe(false);
    expect(isTurnAnswer(messages, "call")).toBe(false);
    expect(isTurnAnswer(messages, "h1")).toBe(false);
    expect(isTurnAnswer(messages, "missing")).toBe(false);
  });
});
