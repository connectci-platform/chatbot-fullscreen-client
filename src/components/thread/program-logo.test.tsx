import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { program } from "@/config/program";
import { ProgramLogo } from "./program-logo";

describe("ProgramLogo", () => {
  it("shows the program's logo with the site name beside it", () => {
    render(<ProgramLogo />);
    const logo = screen.getByRole("img", { name: "ACCESS" });
    expect(logo.getAttribute("src")).toBe(program.logo.src);
    expect(screen.getByText("Assistant")).toBeTruthy();
  });

  it("has a smaller size for the top of a conversation", () => {
    render(<ProgramLogo size="small" />);
    const logo = screen.getByRole("img", { name: "ACCESS" });
    expect(logo.getAttribute("class")).toContain("h-7");
  });
});
