import { describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  ratings: vi.fn(),
  cutOffs: vi.fn(),
  images: vi.fn(),
  tables: vi.fn(),
}));
vi.mock("./answer-ratings", () => ({ forgetRatings: calls.ratings }));
vi.mock("./stopped-answer", () => ({ forgetReloadCutOffs: calls.cutOffs }));
vi.mock("@/hooks/use-stored-image", () => ({
  forgetStoredImages: calls.images,
}));
vi.mock("./xdmod-table-cache", () => ({
  forgetLoadedTables: calls.tables,
}));

import { forgetConversations } from "./forget-conversation";

describe("forgetConversations", () => {
  it("clears every cache, by conversation where it can", () => {
    forgetConversations("t1");
    expect(calls.ratings).toHaveBeenCalledWith("t1");
    expect(calls.cutOffs).toHaveBeenCalledWith("t1");
    expect(calls.images).toHaveBeenCalled();
    expect(calls.tables).toHaveBeenCalled();
  });
});
