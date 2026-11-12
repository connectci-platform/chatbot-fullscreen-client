import type { ComponentProps } from "react";
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

describe("MarkdownText off-site content", () => {
  it("loads images from this site", () => {
    const { container } = render(
      <MarkdownText>{"![chart](/static/c.png)"}</MarkdownText>,
    );
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/static/c.png");
    expect(img?.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("shows an off-site image as its alt text and host, without loading it", () => {
    const { container } = render(
      <MarkdownText>{"![secret](https://evil.com/p.png?d=abc)"}</MarkdownText>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toBe("secret (image from evil.com)");
  });

  it("doesn't nest a link inside a linked off-site image", () => {
    const { container } = render(
      <MarkdownText>
        {"[![logo](https://evil.com/i.png)](https://evil.com/p)"}
      </MarkdownText>,
    );
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("a a")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows only the alt text of a data image", () => {
    const { container } = render(
      <MarkdownText>{"![pixel](data:image/png;base64,AAAA)"}</MarkdownText>,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("pixel");
  });

  it("doesn't label links to ACCESS sites", () => {
    const { container } = render(
      <MarkdownText>{"[docs](https://support.access-ci.org/x)"}</MarkdownText>,
    );
    expect(container.textContent).toBe("docs");
  });

  it("names the host after a link to another site", () => {
    const { container } = render(
      <MarkdownText>{"[Fix it](https://evil.com/?d=1)"}</MarkdownText>,
    );
    expect(screen.getByRole("link", { name: "Fix it" })).toBeTruthy();
    expect(container.textContent).toBe("Fix it (evil.com)");
  });

  it("names the real host of a link disguised with user info", () => {
    const { container } = render(
      <MarkdownText>
        {"[ACCESS](https://access-ci.org@evil.com/x)"}
      </MarkdownText>,
    );
    expect(container.textContent).toBe("ACCESS (evil.com)");
  });

  it("names the host when the link text only contains it", () => {
    const { container } = render(
      <MarkdownText>{"[access-ci.org](https://ss-ci.org/x?d=1)"}</MarkdownText>,
    );
    expect(container.textContent).toBe("access-ci.org (ss-ci.org)");
  });

  it("names the host when the link text mentions it elsewhere", () => {
    const { container } = render(
      <MarkdownText>
        {"[support.access-ci.org, not evil.com](https://evil.com)"}
      </MarkdownText>,
    );
    expect(container.textContent).toContain("(evil.com)");
  });

  it("names the host of a protocol-relative link and opens it in a new tab", () => {
    const { container } = render(
      <MarkdownText>{"[ACCESS docs](//evil.com/x?d=1)"}</MarkdownText>,
    );
    expect(container.textContent).toBe("ACCESS docs (evil.com)");
    const link = screen.getByRole("link", { name: "ACCESS docs" });
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("describes an off-site link by its host for screen readers", () => {
    render(<MarkdownText>{"[Fix it](https://evil.com/?d=1)"}</MarkdownText>);
    const link = screen.getByRole("link", { name: "Fix it" });
    const label = document.getElementById(
      link.getAttribute("aria-describedby") ?? "",
    );
    expect(label?.textContent).toContain("evil.com");
  });

  it("doesn't repeat a host the link text already shows", () => {
    const { container } = render(
      <MarkdownText>{"[https://evil.com/a](https://evil.com/a)"}</MarkdownText>,
    );
    expect(container.textContent).toBe("https://evil.com/a");
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

describe("MarkdownText blocks", () => {
  it("doesn't render a finished block again as the text grows", () => {
    const h2 = vi.fn((props: ComponentProps<"h2">) => <h2 {...props} />);
    const components = { h2 };
    const { rerender } = render(
      <MarkdownText components={components}>
        {"## Delta\n\nIt has"}
      </MarkdownText>,
    );
    rerender(
      <MarkdownText components={components}>
        {"## Delta\n\nIt has GPUs"}
      </MarkdownText>,
    );
    rerender(
      <MarkdownText components={components}>
        {"## Delta\n\nIt has GPUs.\n\n## Anvil"}
      </MarkdownText>,
    );
    expect(h2).toHaveBeenCalledTimes(2);
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
  });
});
