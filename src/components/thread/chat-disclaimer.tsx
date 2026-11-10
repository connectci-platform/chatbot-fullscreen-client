import type { ReactNode } from "react";
import { program } from "@/config/program";

export function ChatDisclaimer(): ReactNode {
  const site = program.siteLinks;
  return (
    <>
      <p className="text-muted-foreground mt-2 text-center text-xs">
        {program.disclaimer}{" "}
        <a
          href={program.privacyUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Notice
        </a>
      </p>
      {/* The site footer's required links, in place of the footer itself. */}
      {site && (
        <nav
          aria-label={site.label}
          className="text-muted-foreground mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-center text-[11px] leading-5"
        >
          {site.acknowledgment && (
            <span>
              {site.acknowledgment.text}{" "}
              <a href={site.acknowledgment.href}>
                {site.acknowledgment.linkText}
              </a>
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
      )}
    </>
  );
}
