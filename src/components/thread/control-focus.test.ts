import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CONVERSATIONS_TOGGLE_ATTR,
  focusConversationsToggle,
} from "./control-focus";

function toggle(parent: HTMLElement, rect: DOMRect | null) {
  const button = document.createElement("button");
  button.setAttribute(CONVERSATIONS_TOGGLE_ATTR, "");
  parent.append(button);
  vi.spyOn(button, "getClientRects").mockReturnValue(
    (rect ? [rect] : []) as unknown as DOMRectList,
  );
  vi.spyOn(button, "getBoundingClientRect").mockReturnValue(
    rect ?? new DOMRect(),
  );
  vi.spyOn(button, "focus");
  return button;
}

describe("focusConversationsToggle", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("picks the toggle on screen over the top bar's, scrolled away above the conversation", () => {
    const scroller = document.createElement("div");
    scroller.style.overflowY = "scroll";
    document.body.append(scroller);
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 390, 700),
    );
    // Laid out, but 900px up the scroller.
    const top = toggle(scroller, new DOMRect(8, -900, 44, 44));
    const bottom = toggle(document.body, new DOMRect(16, 760, 24, 24));

    focusConversationsToggle();

    expect(bottom.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(top.focus).not.toHaveBeenCalled();
  });

  it("skips a toggle that isn't displayed", () => {
    const hidden = toggle(document.body, null);
    const shown = toggle(document.body, new DOMRect(8, 8, 148, 44));

    focusConversationsToggle();

    expect(shown.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(hidden.focus).not.toHaveBeenCalled();
  });

  it("leaves out the toggles in the element it's given", () => {
    const group = document.createElement("div");
    document.body.append(group);
    const leaving = toggle(group, new DOMRect(16, 760, 24, 24));
    const top = toggle(document.body, new DOMRect(8, 8, 44, 44));

    focusConversationsToggle(group);

    expect(top.focus).toHaveBeenCalled();
    expect(leaving.focus).not.toHaveBeenCalled();
  });
});
