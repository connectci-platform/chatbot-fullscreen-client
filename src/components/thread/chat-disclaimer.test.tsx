import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatDisclaimer } from "./chat-disclaimer";

describe("ChatDisclaimer", () => {
  it("shows the disclaimer and Privacy Notice link", () => {
    render(<ChatDisclaimer />);

    expect(
      screen.getByText(
        "AI can make mistakes. Don't share passwords or secrets.",
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

describe("ChatDisclaimer", () => {
  it("leaves the site links to the conversations sidebar", () => {
    render(<ChatDisclaimer />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });
});
