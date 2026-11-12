import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Preview } from "@/lib/confirm";
import { ConfirmCard } from "./confirm-card";

const ONE: Preview = {
  previewId: "a".repeat(32),
  tool: "create_announcement",
  data: {
    title: "Maintenance",
    changes: [{ field: "status", old: "a", new: "b" }],
  },
};
const TWO: Preview = {
  previewId: "b".repeat(32),
  tool: "delete_event",
  data: {},
};

describe("ConfirmCard", () => {
  it("shows each title and its data", () => {
    render(
      <ConfirmCard
        previews={[ONE, TWO]}
        busy={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByText("Post this announcement")).toBeTruthy();
    expect(screen.getByText("Cancel this event series")).toBeTruthy();
    expect(screen.getByText("Maintenance")).toBeTruthy();
    expect(screen.getByText("a → b")).toBeTruthy();
    expect(screen.getByText("Nothing changes until you confirm.")).toBeTruthy();
  });

  it("confirms all ids with the confirm block", () => {
    const onSend = vi.fn();
    render(
      <ConfirmCard
        previews={[ONE, TWO]}
        busy={false}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm all" }));
    expect(onSend).toHaveBeenCalledWith("Confirm", [
      { type: "confirm", preview_ids: [ONE.previewId, TWO.previewId] },
    ]);
  });

  it("says Confirm for one and cancels with no blocks", () => {
    const onSend = vi.fn();
    render(
      <ConfirmCard
        previews={[ONE]}
        busy={false}
        onSend={onSend}
      />,
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onSend).toHaveBeenCalledWith("Cancel", []);
  });

  it("disables both buttons while busy", () => {
    render(
      <ConfirmCard
        previews={[ONE]}
        busy
        onSend={vi.fn()}
      />,
    );
    for (const name of ["Confirm", "Cancel"]) {
      expect(
        (screen.getByRole("button", { name }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
  });
});
