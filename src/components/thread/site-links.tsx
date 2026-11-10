import type { ReactNode } from "react";
import { program } from "@/config/program";

/**
 * The site footer's required links (the program's funding acknowledgment
 * and policies), small and muted at the bottom of the conversations
 * sidebar, in place of the full footer. Same tab, as the footer's were.
 */
export function SiteLinks(): ReactNode {
  const site = program.siteLinks;
  if (!site) return null;
  return (
    <nav
      aria-label={site.label}
      className="text-muted-foreground mt-auto flex w-full shrink-0 flex-wrap gap-x-3 gap-y-1 border-t px-4 py-3 text-xs leading-5"
    >
      {site.acknowledgment && (
        <span className="w-full">
          {site.acknowledgment.text}{" "}
          <a href={site.acknowledgment.href}>{site.acknowledgment.linkText}</a>
        </span>
      )}
      {site.links.map((link) => (
        <a
          key={link.href}
          href={link.href}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
