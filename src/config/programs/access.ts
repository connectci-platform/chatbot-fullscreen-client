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
};
