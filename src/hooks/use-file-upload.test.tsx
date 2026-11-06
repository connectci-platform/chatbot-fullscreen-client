import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ClipboardEvent } from "react";
import { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { useFileUpload } from "./use-file-upload";

const png = new File(["x"], "pic.png", { type: "image/png" });

function pasteEvent() {
  const preventDefault = vi.fn();
  const event = {
    preventDefault,
    clipboardData: { items: [{ kind: "file", getAsFile: () => png }] },
  } as unknown as ClipboardEvent<HTMLTextAreaElement>;
  return { event, preventDefault };
}

function dropEvent(type: string) {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: { files: [png], types: ["Files"] },
  });
  return event;
}

let latest: ReturnType<typeof useFileUpload>;

function Harness({ enabled }: { enabled: boolean }) {
  const upload = useFileUpload({ enabled });
  useEffect(() => {
    latest = upload;
  });
  return (
    <div
      ref={upload.dropRef}
      data-testid="drop"
    />
  );
}

describe("useFileUpload with uploads disabled", () => {
  it("ignores pasted files and leaves default paste alone", async () => {
    const { result } = renderHook(() => useFileUpload({ enabled: false }));
    const { event, preventDefault } = pasteEvent();

    await act(async () => {
      await result.current.handlePaste(event);
    });

    expect(result.current.contentBlocks).toEqual([]);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("ignores dropped files and never shows the drop border", async () => {
    const { getByTestId } = render(<Harness enabled={false} />);

    await act(async () => {
      getByTestId("drop").dispatchEvent(new Event("dragenter"));
      window.dispatchEvent(dropEvent("dragenter"));
    });
    expect(latest.dragOver).toBe(false);

    await act(async () => {
      window.dispatchEvent(dropEvent("drop"));
    });
    expect(latest.contentBlocks).toEqual([]);
  });

  it("still cancels a window drop so the page does not navigate", () => {
    render(<Harness enabled={false} />);
    const drop = dropEvent("drop");
    const dragover = dropEvent("dragover");

    window.dispatchEvent(dragover);
    window.dispatchEvent(drop);

    expect(dragover.defaultPrevented).toBe(true);
    expect(drop.defaultPrevented).toBe(true);
  });
});

describe("useFileUpload with uploads enabled", () => {
  it("adds a dropped image", async () => {
    render(<Harness enabled />);

    await act(async () => {
      window.dispatchEvent(dropEvent("drop"));
    });

    await waitFor(() => expect(latest.contentBlocks).toHaveLength(1));
  });
});
