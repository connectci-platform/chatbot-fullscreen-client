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
};

const programs: Record<string, ProgramConfig> = { access };

export function getProgram(id: string = "access"): ProgramConfig {
  const found = programs[id];
  if (!found) throw new Error(`Unknown program "${id}"`);
  return found;
}

// Each program is its own deployment, so this is fixed at build time. The
// literal env access lets Next inline it into the client bundle.
export const program = getProgram(process.env.NEXT_PUBLIC_PROGRAM || undefined);
