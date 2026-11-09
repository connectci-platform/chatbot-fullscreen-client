import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownText } from "./markdown-text";

vi.mock("./syntax-highlighter", () => ({
  SyntaxHighlighter: ({
    children,
    language,
  }: {
    children: string;
    language: string;
  }) => <div data-testid={`highlighted-${language}`}>{children}</div>,
}));

describe("MarkdownText code", () => {
  it("highlights a fenced block with no language as shell", () => {
    render(<MarkdownText>{"```\nmodule load anaconda3\n```"}</MarkdownText>);
    const block = screen.getByTestId("highlighted-bash");
    expect(block.textContent).toBe("module load anaconda3");
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
    expect(screen.getByText("code")).toBeTruthy();
  });

  it("keeps a labeled block's language", () => {
    const { container } = render(
      <MarkdownText>{"```python\nprint(1)\n```"}</MarkdownText>,
    );
    expect(screen.getByTestId("highlighted-python")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
    expect(screen.getByText("python")).toBeTruthy();
  });

  it("leaves inline code alone", () => {
    render(<MarkdownText>{"Run `python3` first."}</MarkdownText>);
    expect(screen.getByText("python3").tagName).toBe("CODE");
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });
});

describe("MarkdownText links", () => {
  const link = (name: string) => screen.getByRole("link", { name });

  it("opens web links in a new tab so the chat stays open", () => {
    render(
      <MarkdownText>
        {"See [the guide](https://example.org/guide) or [this](http://a.b/)."}
      </MarkdownText>,
    );
    for (const name of ["the guide", "this"]) {
      expect(link(name).getAttribute("target")).toBe("_blank");
      expect(link(name).getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("leaves in-page anchors and mail links in place", () => {
    render(
      <MarkdownText>
        {"Jump [down](#notes) or [email us](mailto:help@access-ci.org)."}
      </MarkdownText>,
    );
    for (const name of ["down", "email us"]) {
      expect(link(name).getAttribute("target")).toBeNull();
      expect(link(name).getAttribute("rel")).toBeNull();
    }
  });
});

describe("MarkdownText headings", () => {
  const md =
    "# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six";
  const classes = (name: string) =>
    screen.getByRole("heading", { name }).className;

  it("keeps semantic tags", () => {
    render(<MarkdownText>{md}</MarkdownText>);
    for (const [i, n] of [
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
    ].entries())
      expect(screen.getByRole("heading", { name: n }).tagName).toBe(
        `H${i + 1}`,
      );
  });

  it("renders # at 36px medium and ## at 24px bold, both in the heading ink", () => {
    render(<MarkdownText>{md}</MarkdownText>);
    expect(classes("One")).toContain("text-4xl");
    expect(classes("One")).toContain("font-medium");
    expect(classes("One")).not.toContain("font-bold");
    expect(classes("Two")).toContain("text-2xl");
    expect(classes("Two")).toContain("font-bold");
    for (const n of ["One", "Two"])
      expect(classes(n)).toContain("text-heading");
  });

  it("renders ### in the dark teal subsection style", () => {
    render(<MarkdownText>{md}</MarkdownText>);
    expect(classes("Three")).toContain("text-xl");
    expect(classes("Three")).toContain("text-brand-dark");
  });

  it("renders #### at 18px and ##### / ###### at 16px, all bold", () => {
    render(<MarkdownText>{md}</MarkdownText>);
    expect(classes("Four")).toContain("text-lg");
    for (const n of ["Five", "Six"]) expect(classes(n)).toContain("text-base");
    for (const n of ["Four", "Five", "Six"])
      expect(classes(n)).toContain("font-bold");
  });
});
