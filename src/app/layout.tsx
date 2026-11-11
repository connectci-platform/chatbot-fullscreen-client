import type { Metadata } from "next";
import "./globals.css";
import { Archivo } from "next/font/google";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { colorVariables, program, siteMetadata } from "@/config/program";
import { SiteChromeTop } from "@/components/SiteChrome";

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

export const metadata: Metadata = siteMetadata(program);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-program={program.id}
      style={colorVariables(program) as React.CSSProperties}
    >
      <body className={`font-sans ${archivo.variable}`}>
        <div className="flex h-dvh flex-col">
          <SiteChromeTop />
          <main className="min-h-0 flex-1">
            <NuqsAdapter>{children}</NuqsAdapter>
          </main>
        </div>
      </body>
    </html>
  );
}
