import { existsSync } from "node:fs";
import path from "node:path";
import { colorVariables, getProgram, iconMetadata } from "./program";

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
  it("points ACCESS at its own icon files, and they exist", () => {
    const { icons } = getProgram("access");
    expect(icons).toEqual({
      svg: "/programs/access/icon.svg",
      png: "/programs/access/icon-32.png",
      apple: "/programs/access/apple-icon.png",
    });
    for (const url of Object.values(icons)) {
      expect(existsSync(path.join(process.cwd(), "public", url))).toBe(true);
    }
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

describe("iconMetadata", () => {
  it("lists the SVG favicon first, the PNG fallback, and the Apple icon", () => {
    expect(
      iconMetadata({
        icons: {
          svg: "/p/icon.svg",
          png: "/p/icon-32.png",
          apple: "/p/apple.png",
        },
      }),
    ).toEqual({
      icon: [
        { url: "/p/icon.svg", type: "image/svg+xml" },
        { url: "/p/icon-32.png", type: "image/png", sizes: "32x32" },
      ],
      apple: { url: "/p/apple.png", sizes: "180x180" },
    });
  });
});
