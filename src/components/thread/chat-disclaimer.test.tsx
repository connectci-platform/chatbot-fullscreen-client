import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { program } from "@/config/program";
import { ChatDisclaimer } from "./chat-disclaimer";

describe("ChatDisclaimer", () => {
  it("shows the disclaimer and Privacy Notice link", () => {
    render(<ChatDisclaimer />);

    expect(screen.getByText(program.disclaimer, { exact: false })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Privacy Notice" });
    expect(link.getAttribute("href")).toBe(program.privacyUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
