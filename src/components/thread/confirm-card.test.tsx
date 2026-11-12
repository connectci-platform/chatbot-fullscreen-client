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
  noChanges: false,
};
const TWO: Preview = {
  previewId: "b".repeat(32),
  tool: "delete_event",
  data: {},
  noChanges: false,
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

  const NOOP: Preview = {
    previewId: "d".repeat(32),
    tool: "update_announcement",
    data: { no_changes: true },
    noChanges: true,
  };

  it("leaves a no-op out of Confirm and shows it as a note", () => {
    const onSend = vi.fn();
    render(
      <ConfirmCard
        previews={[ONE, NOOP]}
        busy={false}
        onSend={onSend}
      />,
    );
    expect(
      screen.getByText("Update this announcement: nothing would change."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onSend).toHaveBeenCalledWith("Confirm", [
      { type: "confirm", preview_ids: [ONE.previewId] },
    ]);
  });

  it("shows no buttons when every preview is a no-op", () => {
    render(
      <ConfirmCard
        previews={[NOOP]}
        busy={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("blocks Confirm past 10 changes but keeps Cancel", () => {
    const many = Array.from({ length: 11 }, (_, i) => ({
      ...ONE,
      previewId: i.toString(16).padStart(32, "0"),
    }));
    render(
      <ConfirmCard
        previews={many}
        busy={false}
        onSend={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/too many changes to confirm at once/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Confirm all" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("makes value blocks keyboard reachable", () => {
    render(
      <ConfirmCard
        previews={[ONE]}
        busy={false}
        onSend={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Title value").getAttribute("tabindex")).toBe(
      "0",
    );
  });
});
