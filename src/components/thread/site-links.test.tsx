import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SiteLinks } from "./site-links";

describe("SiteLinks", () => {
  it("carries the footer's required links in place of the site footer", () => {
    render(<SiteLinks />);
    const nav = screen.getByRole("navigation", { name: "ACCESS links" });
    const href = (name: string) =>
      within(nav).getByRole("link", { name }).getAttribute("href");

    // As the site footer: each award number links to its NSF award page.
    expect(nav).toHaveTextContent(
      "ACCESS is supported by NSF awards #2138259, #2138286, #2138307, #2137603 and #2138296.",
    );
    for (const award of [
      "2138259",
      "2138286",
      "2138307",
      "2137603",
      "2138296",
    ]) {
      expect(href(`#${award}`)).toBe(
        `https://www.nsf.gov/awardsearch/show-award/?AWD_ID=${award}`,
      );
    }
    expect(within(nav).queryByRole("link", { name: "NSF awards" })).toBeNull();
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
    render(<SiteLinks />);
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
    const { SiteLinks: Bare } = await import("./site-links");
    render(<Bare />);
    expect(screen.queryByRole("navigation")).toBeNull();
    vi.doUnmock("@/config/program");
  });
});
