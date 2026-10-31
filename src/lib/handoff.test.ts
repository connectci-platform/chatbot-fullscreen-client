import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const MINT_URL = "https://support.access-ci.org/api/agent-token";
const EXCHANGE_URL = "https://agent.example/api/v1/handoff/exchange";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function call(fetchMock: ReturnType<typeof vi.fn>, n: number) {
  return fetchMock.mock.calls[n] as [string, RequestInit];
}

describe("exchangeHandoffToken", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function exchange() {
    const { exchangeHandoffToken } = await import("./handoff");
    return exchangeHandoffToken("https://agent.example/api/v1", "h1");
  }

  it("sends the exchange with the Bearer token once the mint settles", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL
        ? json(200, { access_token: "t1", expires_in: 900 })
        : json(200, { thread_id: "th1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await exchange()).toEqual({ status: "exchanged", threadId: "th1" });
    const [url, init] = call(fetchMock, 1);
    expect(url).toBe(EXCHANGE_URL);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer t1");
    expect(init.body).toBe('{"token":"h1"}');
  });

  it("sends it anonymously when the user is signed out", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === MINT_URL
        ? json(401, { error: "login_required" })
        : json(200, { thread_id: "th1" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await exchange()).toEqual({ status: "exchanged", threadId: "th1" });
    expect(
      new Headers(call(fetchMock, 1)[1].headers).get("Authorization"),
    ).toBeNull();
  });

  it("doesn't send it when the mint fails, so the handoff token survives", async () => {
    const fetchMock = vi.fn(async () => json(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    expect(await exchange()).toMatchObject({ status: "not_sent" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(call(fetchMock, 0)[0]).toBe(MINT_URL);
  });

  it("reports a refused exchange as no thread", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === MINT_URL
          ? json(200, { access_token: "t1", expires_in: 900 })
          : json(404, {}),
      ),
    );
    expect(await exchange()).toEqual({ status: "exchanged", threadId: null });
  });
});
