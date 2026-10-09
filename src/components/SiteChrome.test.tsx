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

describe("SiteChrome auth state", () => {
  beforeEach(() => {
    universalMenusSpy.mockClear();
    vi.restoreAllMocks();
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://x/api/v1");
  });

  it("passes isLoggedIn=true to UniversalMenus when whoami is authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ authenticated: true, user: "u@access-ci.org" }),
      } as Response),
    );
    const { SiteChromeTopImpl } = await import("./SiteChrome");
    render(<SiteChromeTopImpl />);
    await waitFor(() =>
      expect(
        screen.getByTestId("universal-menus").getAttribute("data-logged-in"),
      ).toBe("true"),
    );
  });

  it("passes isLoggedIn=false when whoami is anonymous", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false, user: null }),
      } as Response),
    );
    const { SiteChromeTopImpl } = await import("./SiteChrome");
    render(<SiteChromeTopImpl />);
    await waitFor(() =>
      expect(
        screen.getByTestId("universal-menus").getAttribute("data-logged-in"),
      ).toBe("false"),
    );
  });

  it("always passes isLoggedIn explicitly (never undefined) so UniversalMenus never self-detects the cookie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: false, user: null }),
      } as Response),
    );
    const { SiteChromeTopImpl } = await import("./SiteChrome");
    render(<SiteChromeTopImpl />);
    await waitFor(() => expect(universalMenusSpy).toHaveBeenCalled());
    const lastProps = universalMenusSpy.mock.calls.at(-1)![0];
    expect(lastProps).toHaveProperty("isLoggedIn");
    expect(typeof lastProps.isLoggedIn).toBe("boolean");
  });
});
