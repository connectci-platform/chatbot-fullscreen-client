import type { ProgramConfig } from "../program";

export const access: ProgramConfig = {
  id: "access",
  name: "ACCESS Assistant",
  siteName: "Assistant",
  logo: {
    src: "/programs/access/logo.svg",
    alt: "ACCESS",
    width: 269,
    height: 41,
  },
  description: "Chat with the ACCESS-CI AI assistant.",
  accountName: "ACCESS account",
  supportUrl: "https://support.access-ci.org",
  privacyUrl: "https://support.access-ci.org/tools/access-qa-tool/privacy",
  disclaimer:
    "AI-powered responses may not always be accurate. Don't share passwords or secrets.",
  features: { fileUploads: false, siteHeader: false },
  starterQuestions: [
    "Sign me up for an upcoming GPU training",
    "Which ACCESS resources have GROMACS, and which versions?",
    "How do I transfer large files to Bridges-2?",
    "What can you help me with?",
  ],
  // "ACCESS and NAIRR Pilot Office Hours". Resource providers' sessions share
  // the broader "ACCESS Collaboration" affiliation, so that can't be used.
  officeHours: { affiliation: "access_nairr_office_hours" },
  colors: {
    primary: "#fec340",
    primaryForeground: "#000000",
    brand: "#107180",
    brandForeground: "#ffffff",
  },
};
