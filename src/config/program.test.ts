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
  it("points ACCESS at its logo file", () => {
    expect(getProgram("access").logo).toEqual({
      src: "/programs/access/logo.svg",
      alt: "ACCESS",
      width: 269,
      height: 41,
    });
  });
  it("uses the slim top bar for ACCESS", () => {
    expect(getProgram("access").features.siteHeader).toBe(false);
  });
});
