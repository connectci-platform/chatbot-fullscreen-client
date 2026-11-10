import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactProvider } from "./artifact";
import { SidePanel } from "./side-panel";

describe("SidePanel", () => {
  it("is a landmark named by its title that Escape and its button close", () => {
    const onClose = vi.fn();
    render(
      <ArtifactProvider>
        <SidePanel
          open
          onClose={onClose}
        />
      </ArtifactProvider>,
    );
    const panel = screen.getByRole("complementary");
    expect(panel.getAttribute("aria-labelledby")).toBe("side-panel-title");
    expect(document.getElementById("side-panel-title")).toBeTruthy();

    const close = screen.getByRole("button", { name: "Close panel" });
    fireEvent.keyDown(close, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(close, { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("is hidden while closed", () => {
    render(
      <ArtifactProvider>
        <SidePanel
          open={false}
          onClose={() => {}}
        />
      </ArtifactProvider>,
    );
    // jsdom has no Tailwind, so check the class that hides it.
    expect(document.querySelector("aside")!.classList.contains("hidden")).toBe(
      true,
    );
  });

  function Host({ fallback }: { fallback?: () => HTMLElement | null }) {
    const [open, setOpen] = useState(false);
    return (
      <ArtifactProvider>
        <form>
          <textarea aria-label="Message" />
        </form>
        <button
          type="button"
          onClick={() => setOpen(true)}
        >
          Compare software
        </button>
        <SidePanel
          open={open}
          onClose={() => setOpen(false)}
          {...(fallback ? { fallbackFocus: fallback } : {})}
        />
      </ArtifactProvider>
    );
  }

  it.each(["button", "Escape"])(
    "gives focus back to the control that opened it, closed by %s",
    (how) => {
      render(<Host />);
      const opener = screen.getByRole("button", { name: "Compare software" });
      opener.focus();
      fireEvent.click(opener);
      const close = screen.getByRole("button", { name: "Close panel" });
      close.focus();
      if (how === "Escape") fireEvent.keyDown(close, { key: "Escape" });
      else fireEvent.click(close);
      expect(document.activeElement).toBe(opener);
    },
  );

  it("falls back to the composer when nothing had focus", () => {
    render(<Host />);
    const opener = screen.getByRole("button", { name: "Compare software" });
    // Opened without a control holding focus, as when an answer arrives.
    (document.activeElement as HTMLElement | null)?.blur();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Message" }),
    );
  });
});
