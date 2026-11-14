import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ClipboardEvent } from "react";
import { useEffect } from "react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import { useFileUpload } from "./use-file-upload";

const auth = vi.hoisted(() => ({ status: "signed_out" as string }));
vi.mock("@/hooks/use-agent-auth", () => ({
  useAuthStatus: () => auth.status,
}));
vi.mock("@/lib/image-resize", () => ({
  // The data stands in for the picture, so equal content gives equal data.
  resizeImage: vi.fn(async (file: File) => ({
    data: await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(btoa(reader.result as string));
      reader.readAsText(file);
    }),
    mimeType: "image/png",
  })),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { toast } from "sonner";

const png = new File(["x"], "pic.png", { type: "image/png" });

function pasteEvent(types: string[] = ["Files"]) {
  const preventDefault = vi.fn();
  const event = {
    preventDefault,
    clipboardData: { types, items: [{ kind: "file", getAsFile: () => png }] },
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

beforeEach(() => vi.mocked(toast.error).mockClear());

const MB = 1024 * 1024;

function pdf(name: string, bytes: number, fill = 0) {
  return new File([new Uint8Array(bytes).fill(fill)], name, {
    type: "application/pdf",
  });
}

function image(name: string, content = name) {
  return new File([content], name, { type: "image/png" });
}

describe("acceptFiles", () => {
  it("refuses the third file for an anonymous user", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.acceptFiles([image("a.png"), image("b.png")]);
    });
    await act(async () => {
      await result.current.acceptFiles([image("c.png")]);
    });
    expect(result.current.contentBlocks).toHaveLength(2);
    expect(toast.error).toHaveBeenCalledWith(
      "You can share up to 2 files in one message. Sign in to share up to 5.",
    );
  });

  it("treats an unknown sign-in state as anonymous", async () => {
    auth.status = "unknown";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.acceptFiles([
        image("a.png"),
        image("b.png"),
        image("c.png"),
      ]);
    });
    expect(result.current.contentBlocks).toHaveLength(2);
  });

  it("allows five files when signed in", async () => {
    auth.status = "signed_in";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.acceptFiles(
        ["a", "b", "c", "d", "e", "f"].map((n) => image(`${n}.png`)),
      );
    });
    expect(result.current.contentBlocks).toHaveLength(5);
    expect(toast.error).toHaveBeenCalledWith(
      "You can share up to 5 files in one message.",
    );
  });

  it("refuses a message over 8 MB total for an anonymous user", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.acceptFiles([
        pdf("a.pdf", 4.5 * MB),
        pdf("b.pdf", 4.5 * MB, 1),
      ]);
    });
    expect(result.current.contentBlocks).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledWith(
      "b.pdf would take this message over 8 MB. Remove a file or sign in to share up to 20 MB.",
    );
  });

  it("adds a file next to a stored one that Edit put back", async () => {
    auth.status = "signed_in";
    const { result } = renderHook(() =>
      useFileUpload({
        initialBlocks: [{ type: "attachment", id: "a".repeat(32) }],
      }),
    );
    await act(async () => {
      await result.current.acceptFiles([image("b.png")]);
    });
    expect(result.current.contentBlocks).toHaveLength(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("accepts a text file picked with no MIME type and skips duplicates", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    const job = () => new File(["echo hi"], "job.sh", { type: "" });
    await act(async () => {
      await result.current.acceptFiles([job()]);
    });
    await act(async () => {
      await result.current.acceptFiles([job()]);
    });
    expect(result.current.contentBlocks).toHaveLength(1);
    expect(result.current.contentBlocks[0]).toMatchObject({
      type: "file",
      mimeType: "text/plain",
    });
  });

  it("sends picker, paste and drop through the same limits", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.handleFileUpload({
        target: { files: [image("a.png")], value: "x" },
      } as never);
    });
    const paste = pasteEvent();
    await act(async () => {
      await result.current.handlePaste(paste.event);
    });
    expect(result.current.contentBlocks).toHaveLength(2);
    await act(async () => {
      await result.current.handlePaste(paste.event);
    });
    // pic.png is a duplicate now, and a third file would also be over the limit.
    expect(result.current.contentBlocks).toHaveLength(2);
  });

  it("leaves a paste that holds text alone, even with a picture of it", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    for (const types of [
      ["text/plain", "text/html", "Files"],
      ["text/html", "Files"],
    ]) {
      const { event, preventDefault } = pasteEvent(types);
      await act(async () => {
        await result.current.handlePaste(event);
      });
      expect(preventDefault).not.toHaveBeenCalled();
    }
    expect(result.current.contentBlocks).toEqual([]);
  });

  it("still takes a paste of only an image", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    const { event, preventDefault } = pasteEvent(["Files"]);
    await act(async () => {
      await result.current.handlePaste(event);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.contentBlocks).toHaveLength(1);
  });

  it("accepts two different pasted images that are both named image.png", async () => {
    auth.status = "signed_out";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await result.current.acceptFiles([image("image.png", "first")]);
    });
    await act(async () => {
      await result.current.acceptFiles([image("image.png", "second")]);
    });
    expect(result.current.contentBlocks).toHaveLength(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("refuses the same file added twice once, even when intakes overlap", async () => {
    auth.status = "signed_in";
    const { result } = renderHook(() => useFileUpload());
    await act(async () => {
      await Promise.all([
        result.current.acceptFiles([image("a.png", "same")]),
        result.current.acceptFiles([image("a.png", "same")]),
      ]);
    });
    expect(result.current.contentBlocks).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "a.png is already attached. Each file can only be added once per message.",
    );
  });
});
