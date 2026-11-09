import type { Metadata } from "next";
import { access } from "./programs/access";

export type ProgramConfig = {
  id: string;
  name: string;
  siteName: string;
  logo: { src: string; alt: string; width: number; height: number };
  /**
   * Browser tab and home-screen icons, under public/programs/<id>/. The SVG
   * is the favicon; the 32px PNG is for browsers without SVG favicons and the
   * 180px PNG is the Apple touch icon.
   */
  icons: { svg: string; png: string; apple: string };
  description: string;
  accountName: string;
  supportUrl: string;
  privacyUrl: string;
  disclaimer: string;
  features: { fileUploads: boolean; siteHeader: boolean };
  /**
   * Questions offered on the empty screen. Clicking one sends it as typed, so
   * each should be one the tools answer well; check them against the live
   * agent when changing them.
   */
  starterQuestions: string[];
  /**
   * The program's own drop-in office hours, picked out of the events API by
   * affiliation. Null hides the office hours box.
   */
  officeHours: { affiliation: string; description: string } | null;
  colors: {
    /** Primary buttons and calls to action. */
    primary: string;
    primaryForeground: string;
    /** Structural brand color: links, toasts. */
    brand: string;
    brandForeground: string;
  };
};

const programs: Record<string, ProgramConfig> = { access };

/** A program's colors as the CSS variables the app styles from. */
export function colorVariables({
  colors,
}: Pick<ProgramConfig, "colors">): Record<string, string> {
  return {
    "--primary": colors.primary,
    "--primary-foreground": colors.primaryForeground,
    "--brand-teal": colors.brand,
    "--brand-foreground": colors.brandForeground,
  };
}

/** A program's icons as Next metadata. */
export function iconMetadata({
  icons,
}: Pick<ProgramConfig, "icons">): Metadata["icons"] {
  return {
    icon: [
      { url: icons.svg, type: "image/svg+xml" },
      { url: icons.png, type: "image/png", sizes: "32x32" },
    ],
    apple: { url: icons.apple, sizes: "180x180" },
  };
}

export function getProgram(id: string = "access"): ProgramConfig {
  const found = programs[id];
  if (!found) throw new Error(`Unknown program "${id}"`);
  return found;
}

// Each program is its own deployment, so this is fixed at build time. The
// literal env access lets Next inline it into the client bundle.
export const program = getProgram(process.env.NEXT_PUBLIC_PROGRAM || undefined);
