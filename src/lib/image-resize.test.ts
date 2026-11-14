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

  it("does not upscale a small image", async () => {
    const { canvas } = setup(400, 300);
    await resizeImage(file);
    expect([canvas.width, canvas.height]).toEqual([400, 300]);
  });

  it("falls back to JPEG when the PNG is over 2 MB", async () => {
    setup(1000, 1000, 3_000_000);
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
});
