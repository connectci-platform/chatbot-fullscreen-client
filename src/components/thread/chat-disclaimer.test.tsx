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

  it("drops only 'AI can make mistakes.' on a line too narrow for it beside the conversation buttons", () => {
    const { container } = render(<ChatDisclaimer />);
    // The line's own width decides, so it's the same with or without the
    // buttons and doesn't change as the conversation scrolls.
    expect(container.firstElementChild).toHaveClass("@container/disclaimer");
    const dropped = screen.getByText("AI can make mistakes.");
    expect(dropped).toHaveClass("hidden", "@min-[26rem]/disclaimer:inline");
    const kept = screen.getByText("Don't share passwords or secrets.");
    expect(kept.closest(".hidden")).toBeNull();
    expect(
      screen.getByRole("link", { name: "Privacy Notice" }).closest(".hidden"),
    ).toBeNull();
  });

  it("keeps two lines' height where the buttons would wrap it onto a second, so the message box doesn't move", () => {
    render(<ChatDisclaimer />);
    const text = screen.getByText(
      "Don't share passwords or secrets.",
    ).parentElement!;
    expect(text).toHaveClass("min-h-8", "@min-[19rem]/disclaimer:min-h-0");
  });

  it("takes both sentences from the program's settings", () => {
    expect(program.disclaimer).toEqual({
      droppable: "AI can make mistakes.",
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
