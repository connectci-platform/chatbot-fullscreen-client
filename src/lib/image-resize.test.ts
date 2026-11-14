import { afterEach, describe, it, expect, vi } from "vitest";
import { resizeImage } from "./image-resize";

function setup(width: number, height: number, pngLength = 100) {
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const ctx = {
    drawImage,
    fillRect,
    fillStyle: "",
    globalCompositeOperation: "",
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toDataURL: vi.fn((type: string) =>
      type === "image/png"
        ? `data:image/png;base64,${"A".repeat(pngLength)}`
        : "data:image/jpeg;base64,JPEGDATA",
    ),
  };
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width, height, close })),
  );
  vi.spyOn(document, "createElement").mockReturnValue(
    canvas as unknown as HTMLCanvasElement,
  );
  return { canvas, drawImage, close };
}

const file = new File(["x"], "shot.png", { type: "image/png" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resizeImage", () => {
  it("scales a 3200x2000 image to 1600 on the long edge", async () => {
    const { canvas, drawImage, close } = setup(3200, 2000);
    const out = await resizeImage(file);
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1000);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 1000);
    expect(out).toEqual({ data: "A".repeat(100), mimeType: "image/png" });
    expect(close).toHaveBeenCalled();
  });

  it("does not upscale a small image that has to be re-encoded", async () => {
    const { canvas } = setup(400, 300);
    await resizeImage(new File(["x"], "a.gif", { type: "image/gif" }));
    expect([canvas.width, canvas.height]).toEqual([400, 300]);
  });

  it("falls back to JPEG when the PNG is over 2 MB", async () => {
    setup(2000, 2000, 3_000_000);
    const out = await resizeImage(file);
    expect(out).toEqual({ data: "JPEGDATA", mimeType: "image/jpeg" });
  });

  it("says so when the image cannot be decoded", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("bad");
      }),
    );
    await expect(resizeImage(file)).rejects.toThrow(
      "Couldn't read that image. Try a PNG or JPEG.",
    );
  });

  it("sends a PNG or JPEG within the limits as it is, without re-encoding", async () => {
    for (const [name, type] of [
      ["a.png", "image/png"],
      ["a.jpg", "image/jpeg"],
    ]) {
      const { canvas } = setup(1200, 900);
      const out = await resizeImage(new File(["hello"], name, { type }));
      expect(out).toEqual({ data: btoa("hello"), mimeType: type });
      expect(canvas.toDataURL).not.toHaveBeenCalled();
    }
  });

  it("treats a file with no type as PNG or JPEG by its name", async () => {
    setup(100, 100);
    const out = await resizeImage(new File(["hi"], "a.JPG", { type: "" }));
    expect(out).toEqual({ data: btoa("hi"), mimeType: "image/jpeg" });
  });

  it("re-encodes a JPEG that is over the dimension limit as JPEG", async () => {
    const { canvas } = setup(3200, 2000);
    const out = await resizeImage(
      new File(["x"], "a.jpg", { type: "image/jpeg" }),
    );
    expect(out).toEqual({ data: "JPEGDATA", mimeType: "image/jpeg" });
    expect(canvas.toDataURL).not.toHaveBeenCalledWith("image/png");
  });

  it("re-encodes a PNG over 2 MB even within the dimension limit", async () => {
    setup(1000, 1000);
    const big = new File([new Uint8Array(3_000_000)], "big.png", {
      type: "image/png",
    });
    const out = await resizeImage(big);
    expect(out).toEqual({ data: "A".repeat(100), mimeType: "image/png" });
  });

  it("keeps the original when the re-encode comes out bigger", async () => {
    const big = new File([new Uint8Array(3_000_000)], "big.jpg", {
      type: "image/jpeg",
    });
    const { canvas } = setup(1000, 1000);
    canvas.toDataURL.mockImplementation(
      () => `data:image/jpeg;base64,${"A".repeat(5_000_000)}`,
    );
    const out = await resizeImage(big);
    expect(out.mimeType).toBe("image/jpeg");
    expect(out.data.length).toBe(4_000_000);
  });

  it("re-encodes a GIF or WebP, since only PNG and JPEG go out", async () => {
    setup(100, 100);
    const out = await resizeImage(
      new File(["x"], "a.webp", { type: "image/webp" }),
    );
    expect(out.mimeType).toBe("image/png");
  });
});
