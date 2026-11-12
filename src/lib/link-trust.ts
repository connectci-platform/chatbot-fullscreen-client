/**
 * Which links and images in an answer point off the program's own sites.
 *
 * Answers can carry text a tool fetched or a user shared, and that text can
 * steer the model into writing a link or image that sends conversation data
 * to another site. An image would be fetched the moment the answer renders,
 * so off-site images aren't loaded; a link needs a click, so off-site links
 * show where they go.
 */

/** The lowercase host of an absolute http(s) link, or null for anything else. */
export function linkHost(href: string): string | null {
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    return new URL(href).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Whether `host` is one of `domains` or a subdomain of one. */
export function isTrustedHost(host: string, domains: string[]): boolean {
  const name = host.toLowerCase();
  return domains.some((domain) => {
    const d = domain.toLowerCase();
    return name === d || name.endsWith(`.${d}`);
  });
}

/**
 * Whether an image source loads from the page's own origin: a relative path,
 * or an absolute http(s) URL on `origin`. Data, script and protocol-relative
 * URLs to other hosts are not.
 */
export function isSameOriginSrc(src: string, origin: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(src) && !/^https?:/i.test(src)) return false;
  try {
    const url = new URL(src, origin);
    return /^https?:$/.test(url.protocol) && url.origin === new URL(origin).origin;
  } catch {
    return false;
  }
}
