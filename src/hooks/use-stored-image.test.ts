import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStoredImage } from "./use-stored-image";

vi.mock("@/providers/Stream", () => ({
  useStreamContext: () => ({ apiUrl: "http://agent" }),
}));
const get = vi.hoisted(() => vi.fn<(path: string) => Promise<Response>>());
const threadGet = vi.hoisted(() => vi.fn(() => get));
vi.mock("@/lib/thread-attachments", () => ({ threadGet }));

const PNG = "iVBORw0KGgo=";

function payload(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

// The cache lives for the session, so each test uses its own id.
let n = 0;
const nextId = () => (n++).toString(16).padStart(32, "a");

describe("useStoredImage", () => {
  beforeEach(() => {
    get.mockReset();
    threadGet.mockClear();
  });

  it("loads a stored image from the attachments endpoint", async () => {
    const id = nextId();
    get.mockResolvedValue(
      payload({ kind: "image", mime_type: "image/png", base64: PNG }),
    );
    const { result } = renderHook(() => useStoredImage("t1", id));
    expect(result.current).toEqual({ missing: false });
    await waitFor(() =>
      expect(result.current.src).toBe(`data:image/png;base64,${PNG}`),
    );
    expect(result.current.missing).toBe(false);
    expect(threadGet).toHaveBeenCalledWith("http://agent", "t1");
    expect(get).toHaveBeenCalledWith(`attachments/${id}`);
  });

  it("builds a JPEG data URL", async () => {
    get.mockResolvedValue(payload({ mime_type: "image/jpeg", base64: PNG }));
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() =>
      expect(result.current.src).toBe(`data:image/jpeg;base64,${PNG}`),
    );
  });

  it("reports a 404 as missing", async () => {
    get.mockResolvedValue(new Response("", { status: 404 }));
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(result.current.missing).toBe(true));
    expect(result.current.src).toBeUndefined();
  });

  it("reports a network failure as failed, not missing", async () => {
    get.mockRejectedValue(new TypeError("network"));
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
  });

  it("reports a 500 as failed, not missing", async () => {
    get.mockResolvedValue(new Response("", { status: 500 }));
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
    expect(result.current.src).toBeUndefined();
  });

  it("never makes a data URL from an SVG payload", async () => {
    get.mockResolvedValue(
      payload({ mime_type: "image/svg+xml", base64: btoa("<svg/>") }),
    );
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
    expect(result.current.src).toBeUndefined();
  });

  it("refuses data that isn't base64, as failed rather than gone", async () => {
    get.mockResolvedValue(
      payload({ mime_type: "image/png", base64: 'x" onerror="y' }),
    );
    const id = nextId();
    const { result } = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.missing).toBe(false);
    expect(result.current.src).toBeUndefined();
  });

  it("fetches each image once per session", async () => {
    const id = nextId();
    get.mockResolvedValue(payload({ mime_type: "image/png", base64: PNG }));
    const first = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(first.result.current.src).toBeDefined());
    first.rerender();
    const second = renderHook(() => useStoredImage("t1", id));
    expect(second.result.current.src).toBe(`data:image/png;base64,${PNG}`);
    expect(get).toHaveBeenCalledOnce();
  });

  it("tries again after a failure that wasn't a 404", async () => {
    const id = nextId();
    get.mockResolvedValueOnce(new Response("", { status: 503 }));
    const first = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(first.result.current.failed).toBe(true));
    first.unmount();

    get.mockResolvedValueOnce(payload({ mime_type: "image/png", base64: PNG }));
    const second = renderHook(() => useStoredImage("t1", id));
    await waitFor(() => expect(second.result.current.src).toBeDefined());
  });
});
