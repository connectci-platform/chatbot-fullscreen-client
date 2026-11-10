import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAutoGrow } from "./use-auto-grow";

function Box({ value }: { value: string }) {
  const ref = useAutoGrow<HTMLTextAreaElement>(value);
  return (
    <textarea
      ref={ref}
      aria-label="Message"
      value={value}
      readOnly
    />
  );
}

/** A textarea's content height: 24px a line, plus 20px of padding. */
function stubScrollHeight() {
  return vi
    .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
    .mockImplementation(function (this: HTMLTextAreaElement) {
      return this.value.split("\n").length * 24 + 20;
    });
}

function stubFieldSizing(supported: boolean) {
  vi.stubGlobal("CSS", {
    supports: (property: string, value: string) =>
      supported && property === "field-sizing" && value === "content",
  });
}

describe("useAutoGrow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("where CSS field-sizing isn't supported (Firefox)", () => {
    it("sizes the box to its text on first render", () => {
      stubFieldSizing(false);
      stubScrollHeight();
      const { getByRole } = render(<Box value={"one\ntwo"} />);
      expect(getByRole("textbox").style.height).toBe("68px");
    });

    it("grows as text is added and shrinks when it's cleared", () => {
      stubFieldSizing(false);
      stubScrollHeight();
      const { getByRole, rerender } = render(<Box value="" />);
      const box = getByRole("textbox");
      expect(box.style.height).toBe("44px");

      rerender(<Box value={"a\nb\nc"} />);
      expect(box.style.height).toBe("92px");

      // Cleared after send, or a different thread's empty draft.
      rerender(<Box value="" />);
      expect(box.style.height).toBe("44px");
    });

    it("measures from the content, not the height it was last given", () => {
      stubFieldSizing(false);
      const seen: string[] = [];
      vi.spyOn(
        HTMLTextAreaElement.prototype,
        "scrollHeight",
        "get",
      ).mockImplementation(function (this: HTMLTextAreaElement) {
        seen.push(this.style.height);
        return 44;
      });
      const { rerender } = render(<Box value="a" />);
      rerender(<Box value="ab" />);
      expect(seen.every((h) => h === "auto")).toBe(true);
    });
  });

  it("leaves sizing to CSS where field-sizing is supported", () => {
    stubFieldSizing(true);
    const height = stubScrollHeight();
    const { getByRole, rerender } = render(<Box value="a" />);
    rerender(<Box value={"a\nb"} />);
    expect(getByRole("textbox").style.height).toBe("");
    expect(height).not.toHaveBeenCalled();
  });
});
