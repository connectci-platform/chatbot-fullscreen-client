import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MINT_URL = "https://support.access-ci.org/api/agent-token";
const API = "https://agent.example/api/v1";
const URL = `${API}/me/assistant-consent`;

const minted = () =>
  new Response(JSON.stringify({ access_token: "t1", expires_in: 900 }), {
    status: 200,
  });
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

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

async function load() {
  return import("./personalization");
}

describe("personalization setting", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  it("reads the setting with the user's token", async () => {
    const fetchMock = stubAgent(() =>
      json(200, { consent: "allow", asked_at: null }),
    );
    const p = await load();
    await p.loadConsent(API);
    const [[url, init]] = agentCalls(fetchMock);
    expect(url).toBe(URL);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer t1");
  });

  it("shows unknown when the read fails or the reply is unreadable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const reply of [
      () => json(503, { error: "x" }),
      () => json(200, { consent: "maybe" }),
    ]) {
      stubAgent(reply);
      const p = await load();
      await p.loadConsent(API);
      const { renderHook } = await import("@testing-library/react");
      const { result } = renderHook(() => p.usePersonalization());
      expect(result.current.consent).toBeNull();
      vi.resetModules();
    }
  });

  it("saves a choice and shows what was stored", async () => {
    const fetchMock = stubAgent(() =>
      json(200, { consent: "deny", asked_at: null }),
    );
    const p = await load();
    await expect(p.saveConsent(API, "deny")).resolves.toBe("deny");
    const [[url, init]] = agentCalls(fetchMock);
    expect(url).toBe(URL);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ consent: "deny" });
  });

  it("throws when a choice can't be saved and keeps the old state", async () => {
    stubAgent(() => json(200, { consent: "allow", asked_at: null }));
    const p = await load();
    await p.loadConsent(API);
    stubAgent(() => json(503, { error: "x" }));
    await expect(p.saveConsent(API, "deny")).rejects.toThrow();
    const { renderHook } = await import("@testing-library/react");
    const { result } = renderHook(() => p.usePersonalization());
    expect(result.current.consent).toBe("allow");
  });
});

describe("the offer and Allow once", () => {
  beforeEach(() => vi.resetModules());

  it("shows an offer for its thread until dismissed", async () => {
    const p = await load();
    const { renderHook, act } = await import("@testing-library/react");
    const { result } = renderHook(() => p.usePersonalization());
    act(() => p.showOffer("t1"));
    expect(result.current.offerThreadId).toBe("t1");
    act(() => p.dismissOffer());
    expect(result.current.offerThreadId).toBeNull();
    act(() => p.showOffer(null));
    expect(result.current.offerThreadId).toBeNull();
  });

  it("Allow once covers only its conversation and ends its offer", async () => {
    const p = await load();
    p.showOffer("t1");
    p.allowOnce("t1");
    expect(p.isAllowedOnce("t1")).toBe(true);
    expect(p.isAllowedOnce("t2")).toBe(false);
    expect(p.isAllowedOnce(null)).toBe(false);
    // A conversation already allowed once isn't offered again.
    p.showOffer("t1");
    const { renderHook } = await import("@testing-library/react");
    expect(
      renderHook(() => p.usePersonalization()).result.current.offerThreadId,
    ).toBeNull();
  });

  it("signing out forgets the setting and every Allow once", async () => {
    const p = await load();
    p.allowOnce("t1");
    p.resetPersonalization();
    expect(p.isAllowedOnce("t1")).toBe(false);
  });

  it("recognizes the offer event", async () => {
    const p = await load();
    expect(
      p.isPersonalizationOfferEvent({ type: "personalization_offer" }),
    ).toBe(true);
    expect(p.isPersonalizationOfferEvent({ type: "status" })).toBe(false);
    expect(p.isPersonalizationOfferEvent(null)).toBe(false);
  });
});
