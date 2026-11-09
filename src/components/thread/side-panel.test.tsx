import { fireEvent, render, screen } from "@testing-library/react";
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
});
