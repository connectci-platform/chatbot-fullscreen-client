import type { Metadata } from "next";
import "./globals.css";
import { Archivo } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { program } from "@/config/program";
import { SiteChromeTop, SiteFooter } from "@/components/SiteChrome";

// The @access-ci/ui chrome's CSS asks for "Archivo". Its components render
// in shadow DOM (style-isolated from the app), but fonts are not
// shadow-scoped, so the host document must load Archivo or the chrome falls
// back to a generic font and looks off-brand. The app body also uses Archivo
// (via --font-sans in globals.css) to match the ACCESS brand throughout.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  title: program.name,
  description: program.description,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-program={program.id}
    >
      <body className={`font-sans ${archivo.variable}`}>
        <SiteChromeTop />
        <NuqsAdapter>{children}</NuqsAdapter>
        <SiteFooter />
      </body>
    </html>
  );
}
