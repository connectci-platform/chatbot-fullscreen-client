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
  icons: {
    svg: "/programs/access/icon.svg",
    png: "/programs/access/icon-32.png",
    apple: "/programs/access/apple-icon.png",
  },
  description:
    "Ask about ACCESS resources, allocations, software, training and usage, answered from ACCESS documentation and live data.",
  siteUrl: "https://qa.access-ci.org",
  trustedDomains: ["access-ci.org"],
  shareImage: {
    src: "/programs/access/share.png",
    alt: "ACCESS Assistant: answers about ACCESS resources, allocations, software, training and usage.",
  },
  accountName: "ACCESS account",
  supportUrl: "https://support.access-ci.org",
  privacyUrl: "https://support.access-ci.org/tools/access-qa-tool/privacy",
  disclaimer: {
    droppable: "AI can make mistakes.",
    text: "Don't share passwords or secrets.",
  },
  features: { fileUploads: false, siteHeader: false },
  starterQuestions: [
    "Sign me up for an upcoming GPU training",
    "Which ACCESS resources have GROMACS, and which versions?",
    "How do I transfer large files to Bridges-2?",
    "What can you help me with?",
  ],
  // "ACCESS and NAIRR Pilot Office Hours". Resource providers' sessions share
  // the broader "ACCESS Collaboration" affiliation, so that can't be used.
  officeHours: {
    affiliation: "access_nairr_office_hours",
    description: "Talk with ACCESS staff.",
  },
  // The links the ACCESS site footer (@access-ci/ui) requires, same URLs.
  // Its awards sentence is shortened to a link to the page that lists them.
  siteLinks: {
    label: "ACCESS links",
    acknowledgment: {
      text: "ACCESS is supported by",
      linkText: "NSF awards",
      href: "https://access-ci.org/about/acknowledging-access/",
    },
    links: [
      { label: "Contact ACCESS", href: "https://access-ci.org/contact/" },
      {
        label: "Acceptable Use",
        href: "https://access-ci.org/acceptable-use/",
      },
      {
        label: "Code of Conduct",
        href: "https://access-ci.org/code-of-conduct/",
      },
      { label: "Privacy Policy", href: "https://access-ci.org/privacy-policy" },
    ],
  },
  colors: {
    primary: "#fec340",
    primaryForeground: "#000000",
    brand: "#107180",
    brandForeground: "#ffffff",
  },
};
