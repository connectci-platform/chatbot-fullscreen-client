import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared chrome so we can assert the props we pass it, without
// pulling the real shadow-DOM web component into jsdom.
const universalMenusSpy = vi.fn();
vi.mock("@access-ci/ui/react", () => ({
  UniversalMenus: (props: Record<string, unknown>) => {
    universalMenusSpy(props);
    return (
      <div
        data-testid="universal-menus"
        data-logged-in={String(props.isLoggedIn)}
      />
    );
  },
  Header: () => <div data-testid="header" />,
  Footer: () => <div data-testid="footer" />,
}));

function mintResponse(status: number, body: unknown = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: () => Promise.resolve(body),
  } as Response);
}

const MINTED = { access_token: "t1", token_type: "Bearer", expires_in: 900 };
const LOGIN_REQUIRED = { error: "login_required", error_description: "x" };

async function renderChrome() {
  const { SiteChromeTopImpl } = await import("./SiteChrome");
  render(<SiteChromeTopImpl />);
}

function loggedIn() {
  return screen.getByTestId("universal-menus").getAttribute("data-logged-in");
}

describe("SiteChrome auth state", () => {
  beforeEach(() => {
    universalMenusSpy.mockClear();
    vi.restoreAllMocks();
    // A fresh page token source per test.
    vi.resetModules();
  });

  it("passes isLoggedIn=true when support mints a token", async () => {
    const fetchMock = mintResponse(200, MINTED);
    vi.stubGlobal("fetch", fetchMock);
    await renderChrome();
    await waitFor(() => expect(loggedIn()).toBe("true"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://support.access-ci.org/api/agent-token",
      expect.objectContaining({ method: "POST", credentials: "include" }),
    );
  });

  it("passes isLoggedIn=false when the mint says login_required", async () => {
    vi.stubGlobal("fetch", mintResponse(401, LOGIN_REQUIRED));
    await renderChrome();
    await waitFor(() =>
      expect(universalMenusSpy.mock.calls.length).toBeGreaterThan(0),
    );
    await waitFor(() => expect(loggedIn()).toBe("false"));
  });

  it("always passes isLoggedIn explicitly (never undefined) so UniversalMenus never self-detects the cookie", async () => {
    vi.stubGlobal("fetch", mintResponse(401, LOGIN_REQUIRED));
    await renderChrome();
    await waitFor(() => expect(universalMenusSpy).toHaveBeenCalled());
    const lastProps = universalMenusSpy.mock.calls.at(-1)![0];
    expect(lastProps).toHaveProperty("isLoggedIn");
    expect(typeof lastProps.isLoggedIn).toBe("boolean");
  });

  it("logs in and out via support, not CILogon", async () => {
    vi.stubGlobal("fetch", mintResponse(200, MINTED));
    await renderChrome();
    await waitFor(() => expect(universalMenusSpy).toHaveBeenCalled());

    const { loginUrl, logoutUrl } = universalMenusSpy.mock.calls.at(-1)![0] as {
      loginUrl: string;
      logoutUrl: string;
    };

    // Support mints the agent tokens, so the sign-in that counts is
    // support's. Its logout ends the Drupal session and the SSO cookies and
    // then redirects on to CILogon, so that session ends too.
    expect(loginUrl).toBe("https://support.access-ci.org/user/login");
    expect(logoutUrl).toBe("https://support.access-ci.org/user/logout");
    expect(logoutUrl).not.toContain("cilogon.org");
  });

  it("uses NEXT_PUBLIC_SUPPORT_URL for the mint and the login links", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPPORT_URL", "https://accessmatch.ddev.site");
    const fetchMock = mintResponse(200, MINTED);
    vi.stubGlobal("fetch", fetchMock);
    await renderChrome();
    await waitFor(() => expect(loggedIn()).toBe("true"));
    expect(fetchMock).toHaveBeenCalledWith(
      "https://accessmatch.ddev.site/api/agent-token",
      expect.anything(),
    );
    expect(universalMenusSpy.mock.calls.at(-1)![0].loginUrl).toBe(
      "https://accessmatch.ddev.site/user/login",
    );
    vi.unstubAllEnvs();
  });
});
