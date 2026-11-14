import { existsSync } from "node:fs";
import path from "node:path";
import {
  colorVariables,
  getProgram,
  iconMetadata,
  siteMetadata,
} from "./program";

describe("getProgram", () => {
  it("defaults to ACCESS", () => {
    expect(getProgram().id).toBe("access");
    expect(getProgram().name).toBe("ACCESS Assistant");
  });

  it("rejects an unknown program", () => {
    expect(() => getProgram("nope")).toThrow('Unknown program "nope"');
  });

  it("turns uploads on for ACCESS", () => {
    expect(getProgram("access").features.fileUploads).toBe(true);
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

describe("siteMetadata", () => {
  const access = getProgram("access");
  const meta = siteMetadata(access);

  it("serves ACCESS from qa.access-ci.org, and its share image exists", () => {
    expect(access.siteUrl).toBe("https://qa.access-ci.org");
    expect(meta.metadataBase?.toString()).toBe("https://qa.access-ci.org/");
    expect(
      existsSync(path.join(process.cwd(), "public", access.shareImage.src)),
    ).toBe(true);
  });

  it("points the canonical address at the start screen", () => {
    expect(meta.alternates?.canonical).toBe("/");
  });

  it("gives shared links a large preview card with the program's text", () => {
    const image = {
      url: "/programs/access/share.png",
      width: 1200,
      height: 630,
      alt: access.shareImage.alt,
    };
    expect(meta.openGraph).toMatchObject({
      type: "website",
      url: "/",
      siteName: "ACCESS Assistant",
      title: "ACCESS Assistant",
      description: access.description,
      images: [image],
    });
    expect(meta.twitter).toMatchObject({
      card: "summary_large_image",
      title: "ACCESS Assistant",
      description: access.description,
      images: [image],
    });
  });

  it("keeps the title, summary and icons", () => {
    expect(meta.title).toBe("ACCESS Assistant");
    expect(meta.description).toBe(access.description);
    expect(meta.icons).toEqual(iconMetadata(access));
  });
});
