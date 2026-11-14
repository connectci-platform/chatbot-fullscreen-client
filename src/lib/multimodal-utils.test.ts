import { afterEach, describe, it, expect, vi } from "vitest";
import {
  fileKind,
  fileToContentBlock,
  textFileExtension,
  unsupportedMessage,
} from "./multimodal-utils";
import { ANONYMOUS_LIMITS } from "@/config/uploads";

vi.mock("./image-resize", () => ({
  resizeImage: vi.fn(async () => ({ data: "RESIZED", mimeType: "image/jpeg" })),
}));

afterEach(() => vi.clearAllMocks());

describe("fileToContentBlock", () => {
  it("sends a .slurm file with an empty MIME type as text/plain", async () => {
    const file = new File(["#SBATCH -N 1\n"], "job.slurm", { type: "" });
    const block = await fileToContentBlock(file, ANONYMOUS_LIMITS);
    expect(block).toEqual({
      type: "file",
      mimeType: "text/plain",
      data: btoa("#SBATCH -N 1\n"),
      metadata: { filename: "job.slurm" },
    });
  });

  it("rejects a file with a NUL byte", async () => {
    const file = new File([new Uint8Array([104, 0, 105])], "a.txt", {
      type: "text/plain",
    });
    await expect(fileToContentBlock(file, ANONYMOUS_LIMITS)).rejects.toThrow(
      "That doesn't look like a text file.",
    );
  });

  it("resizes images, keeps the original name, and uses the resized type", async () => {
    const file = new File(["x"], "Screenshot.webp", { type: "image/webp" });
    expect(await fileToContentBlock(file, ANONYMOUS_LIMITS)).toEqual({
      type: "image",
      mimeType: "image/jpeg",
      data: "RESIZED",
      metadata: { name: "Screenshot.webp" },
    });
  });

  it("refuses an image over the limit before resizing", async () => {
    const file = new File(["x"], "Big.png", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
    await expect(fileToContentBlock(file, ANONYMOUS_LIMITS)).rejects.toThrow(
      "Big.png is too large. Images can be up to 5 MB.",
    );
  });

  it("refuses a PDF over the limit", async () => {
    const file = new File(["x"], "Big.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: 6 * 1024 * 1024 });
    await expect(fileToContentBlock(file, ANONYMOUS_LIMITS)).rejects.toThrow(
      "Big.pdf is too large. PDFs can be up to 5 MB.",
    );
  });

  it("refuses a text file over the limit", async () => {
    const file = new File(["x"], "big.log", { type: "" });
    Object.defineProperty(file, "size", { value: 101 * 1024 });
    await expect(fileToContentBlock(file, ANONYMOUS_LIMITS)).rejects.toThrow(
      "big.log is too large. Text files can be up to 100 KB.",
    );
  });

  it("rejects other file types", async () => {
    const file = new File(["x"], "a.exe", { type: "application/octet-stream" });
    await expect(fileToContentBlock(file, ANONYMOUS_LIMITS)).rejects.toThrow(
      "a.exe isn't a supported file. Share an image, a PDF, or a text file.",
    );
  });
});

describe("textFileExtension", () => {
  it("matches the spec list, case-insensitively", () => {
    expect(textFileExtension("Run.SBATCH")).toBe(true);
    expect(textFileExtension("x.f90")).toBe(true);
    expect(textFileExtension("x.docx")).toBe(false);
    expect(textFileExtension("Makefile")).toBe(false);
  });
});

describe("fileKind", () => {
  const f = (name: string, type = "") => new File(["x"], name, { type });

  it("falls back to the extension when the type is empty", () => {
    expect(fileKind(f("shot.PNG"))).toBe("image");
    expect(fileKind(f("photo.jpeg"))).toBe("image");
    expect(fileKind(f("paper.pdf"))).toBe("pdf");
    expect(fileKind(f("job.sh"))).toBe("text");
  });

  it("trusts a type that is given over the name", () => {
    expect(fileKind(f("shot.png", "application/x-msdownload"))).toBeNull();
    expect(fileKind(f("shot.png", "image/jpeg"))).toBe("image");
  });

  it("does not accept HEIC, and says why", () => {
    for (const file of [
      f("IMG_1.heic"),
      f("IMG_2.HEIF"),
      f("IMG_3.jpg", "image/heic"),
    ]) {
      expect(fileKind(file)).toBeNull();
      expect(unsupportedMessage(file)).toBe(
        "HEIC photos aren't supported yet. Export it as JPEG or PNG and share that.",
      );
    }
  });

  it("names an unsupported file in the generic message", () => {
    expect(unsupportedMessage(f("a.exe"))).toBe(
      "a.exe isn't a supported file. Share an image, a PDF, or a text file.",
    );
  });
});
