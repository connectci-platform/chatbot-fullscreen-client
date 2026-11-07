import { colorVariables, getProgram } from "./program";

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

describe("colorVariables", () => {
  it("turns a program's colors into the app's CSS variables", () => {
    expect(
      colorVariables({
        colors: {
          primary: "#111111",
          primaryForeground: "#222222",
          brand: "#333333",
          brandForeground: "#444444",
        },
      }),
    ).toEqual({
      "--primary": "#111111",
      "--primary-foreground": "#222222",
      "--brand-teal": "#333333",
      "--brand-foreground": "#444444",
    });
  });
});
