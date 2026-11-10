import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChatDisclaimer } from "./chat-disclaimer";

describe("ChatDisclaimer", () => {
  it("shows the disclaimer and Privacy Notice link", () => {
    render(<ChatDisclaimer />);

    expect(
      screen.getByText(
        "AI-powered responses may not always be accurate. Don't share passwords or secrets.",
      ),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Privacy Notice" });
    expect(link.getAttribute("href")).toBe(
      "https://support.access-ci.org/tools/access-qa-tool/privacy",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});

describe("ChatDisclaimer site links", () => {
  it("carries the footer's required links in place of the site footer", () => {
    render(<ChatDisclaimer />);
    const nav = screen.getByRole("navigation", { name: "ACCESS links" });
    const href = (name: string) =>
      within(nav).getByRole("link", { name }).getAttribute("href");

    expect(nav).toHaveTextContent("ACCESS is supported by NSF awards");
    expect(href("NSF awards")).toBe(
      "https://access-ci.org/about/acknowledging-access/",
    );
    expect(href("Contact ACCESS")).toBe("https://access-ci.org/contact/");
    expect(href("Acceptable Use")).toBe(
      "https://access-ci.org/acceptable-use/",
    );
    expect(href("Code of Conduct")).toBe(
      "https://access-ci.org/code-of-conduct/",
    );
    expect(href("Privacy Policy")).toBe("https://access-ci.org/privacy-policy");
  });

  it("opens them in the same tab, as the site footer did", () => {
    render(<ChatDisclaimer />);
    const nav = screen.getByRole("navigation", { name: "ACCESS links" });
    for (const link of within(nav).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("target");
    }
  });

  it("leaves the links out for a program without them", async () => {
    vi.resetModules();
    vi.doMock("@/config/program", async (importOriginal) => {
      const actual = await importOriginal<typeof import("@/config/program")>();
      return { program: { ...actual.program, siteLinks: null } };
    });
    const { ChatDisclaimer: Bare } = await import("./chat-disclaimer");
    render(<Bare />);
    expect(screen.queryByRole("navigation")).toBeNull();
    vi.doUnmock("@/config/program");
  });
});
