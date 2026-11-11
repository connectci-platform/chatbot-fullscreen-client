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
  /**
   * The summary under the title in search results and link previews. Says
   * what can be asked, in a program reader's words.
   */
  description: string;
  /**
   * The public address this program's assistant is served from. Link
   * previews need absolute URLs, and the canonical address, robots.txt and
   * sitemap name it.
   */
  siteUrl: string;
  /**
   * The 1200x630 picture a link preview shows (Slack, Teams, email, social
   * sites), under public/programs/<id>/.
   */
  shareImage: { src: string; alt: string };
  accountName: string;
  supportUrl: string;
  privacyUrl: string;
  /**
   * The line under the message box, before the Privacy Notice link. On a
   * line too narrow to hold all of it beside the conversation buttons,
   * `droppable` (which comes first) is left out and `text` stays.
   */
  disclaimer: { droppable?: string; text: string };
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
  /**
   * The site footer's required links, shown small under the disclaimer in
   * place of the full footer so the chat fills the screen. Null shows none.
   */
  siteLinks: {
    /** Names the row for screen readers. */
    label: string;
    /** The funding acknowledgment: `text` then a link. */
    acknowledgment: { text: string; linkText: string; href: string } | null;
    links: { label: string; href: string }[];
  } | null;
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

/**
 * The page metadata for a program: title and summary, icons, the canonical
 * address, and the Open Graph and Twitter tags that make a shared link show a
 * preview card.
 */
export function siteMetadata(
  p: Pick<
    ProgramConfig,
    "name" | "description" | "siteUrl" | "shareImage" | "icons"
  >,
): Metadata {
  const image = {
    url: p.shareImage.src,
    width: 1200,
    height: 630,
    alt: p.shareImage.alt,
  };
  return {
    metadataBase: new URL(p.siteUrl),
    title: p.name,
    description: p.description,
    applicationName: p.name,
    icons: iconMetadata(p),
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      url: "/",
      siteName: p.name,
      title: p.name,
      description: p.description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: p.name,
      description: p.description,
      images: [image],
    },
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
