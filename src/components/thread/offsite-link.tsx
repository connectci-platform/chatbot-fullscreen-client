"use client";

import {
  Children,
  isValidElement,
  useId,
  type ComponentProps,
  type ReactNode,
} from "react";
import { program } from "@/config/program";
import { isTrustedHost, linkHost } from "@/lib/link-trust";

/** The text a link shows. */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement<{ children?: ReactNode }>(child)
          ? textOf(child.props.children)
          : "",
    )
    .join("");
}

/**
 * The host of a link to a site outside the program's own, for showing beside
 * it, or null when the link stays on the program's sites or its text is that
 * same address. Answers and source passages can carry text a tool fetched or
 * a user shared, and a link built from it shouldn't pass as one of the
 * program's own. Text that merely mentions the host isn't enough to hide it:
 * "access-ci.org" contains "ss-ci.org".
 */
function offsiteHost(
  href: string | undefined,
  children: ReactNode,
): string | null {
  const host = href ? linkHost(href) : null;
  if (!host || isTrustedHost(host, program.trustedDomains)) return null;
  const text = textOf(children).trim().toLowerCase();
  return text === host || linkHost(text) === host ? null : host;
}

/**
 * A link that names its host after its text when the host is outside the
 * program's sites. The host is also the link's description, so it's read out
 * when a screen reader lists links.
 */
export function OffsiteLink({ children, ...props }: ComponentProps<"a">) {
  const id = useId();
  const host = offsiteHost(props.href, children);
  return (
    <>
      <a
        {...props}
        aria-describedby={host ? id : props["aria-describedby"]}
      >
        {children}
      </a>
      {host && (
        <span
          id={id}
          className="text-muted-foreground"
        >
          {" "}
          ({host})
        </span>
      )}
    </>
  );
}
