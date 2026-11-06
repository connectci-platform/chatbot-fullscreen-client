import { getProgram } from "./program";

describe("getProgram", () => {
  it("defaults to ACCESS", () => {
    expect(getProgram().id).toBe("access");
    expect(getProgram().name).toBe("ACCESS Assistant");
  });

  it("rejects an unknown program", () => {
    expect(() => getProgram("nope")).toThrow('Unknown program "nope"');
  });

  it("keeps uploads off for ACCESS", () => {
    expect(getProgram("access").features.fileUploads).toBe(false);
  });
});
