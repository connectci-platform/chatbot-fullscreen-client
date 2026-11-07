import { access } from "./programs/access";

export type ProgramConfig = {
  id: string;
  name: string;
  siteName: string;
  logo: { src: string; alt: string; width: number; height: number };
  description: string;
  accountName: string;
  supportUrl: string;
  privacyUrl: string;
  disclaimer: string;
  features: { fileUploads: boolean; siteHeader: boolean };
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

export function getProgram(id: string = "access"): ProgramConfig {
  const found = programs[id];
  if (!found) throw new Error(`Unknown program "${id}"`);
  return found;
}

// Each program is its own deployment, so this is fixed at build time. The
// literal env access lets Next inline it into the client bundle.
export const program = getProgram(process.env.NEXT_PUBLIC_PROGRAM || undefined);
