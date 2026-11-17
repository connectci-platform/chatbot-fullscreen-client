import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ChatDisclaimer } from "./chat-disclaimer";
import { program } from "@/config/program";

describe("ChatDisclaimer", () => {
  it("shows the disclaimer and Privacy Notice link", () => {
    const { container } = render(<ChatDisclaimer />);

    expect(container).toHaveTextContent(
      "AI can make mistakes. Don't share passwords or secrets. Privacy Notice",
    );
    const link = screen.getByRole("link", { name: "Privacy Notice" });
    expect(link.getAttribute("href")).toBe(
      "https://support.access-ci.org/tools/access-qa-tool/privacy",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("leaves the site links to the conversations sidebar", () => {
    render(<ChatDisclaimer />);
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("never hides any of the disclaimer, however narrow the line", () => {
    const { container } = render(<ChatDisclaimer />);
    expect(container.querySelector("[class*='hidden']")).toBeNull();
    expect(screen.getByText(/AI can make mistakes\./)).toBeVisible();
  });

  it("keeps the line as tall with the conversation buttons as without, so the message box doesn't move", () => {
    const { container } = render(<ChatDisclaimer />);
    const text = screen.getByText(
      "Don't share passwords or secrets.",
    ).parentElement!;
    // Two 16px rows beside the 24px buttons below 26rem.
    expect(text).toHaveClass("min-h-8", "@min-[26rem]/disclaimer:min-h-0");
    // Room for the 44px buttons and three rows beside them on a phone or touch screen.
    expect(container.firstElementChild).toHaveClass(
      "max-sm:min-h-12",
      "pointer-coarse:min-h-12",
    );
  });

  it("takes both sentences from the program's settings", () => {
    expect(program.disclaimer).toEqual({
      lead: "AI can make mistakes.",
      text: "Don't share passwords or secrets.",
    });
  });

  it("puts the controls it's given at the left of the line", () => {
    render(<ChatDisclaimer controls={<button type="button">Go</button>} />);
    const button = screen.getByRole("button", { name: "Go" });
    const text = screen.getByText("Don't share passwords or secrets.");
    expect(
      button.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
