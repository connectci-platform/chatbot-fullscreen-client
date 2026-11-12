import { describe, expect, it } from "vitest";
import { isSameOriginSrc, isTrustedHost, linkHost } from "./link-trust";

const origin = "https://qa.access-ci.org";

describe("linkHost", () => {
  it("lowercases the host of a web link", () => {
    expect(linkHost("https://Support.ACCESS-ci.org/a")).toBe(
      "support.access-ci.org",
    );
  });

  it("reads the real host past a user-info prefix", () => {
    expect(linkHost("https://access-ci.org@evil.com/x")).toBe("evil.com");
  });

  it("shows an internationalized host in punycode", () => {
    expect(linkHost("https://аccess-ci.org/x")).toBe("xn--ccess-ci-06g.org");
  });

  it("has no host for mail, relative and in-page links", () => {
    expect(linkHost("mailto:help@access-ci.org")).toBeNull();
    expect(linkHost("/relative")).toBeNull();
    expect(linkHost("#section")).toBeNull();
    expect(linkHost("javascript:alert(1)")).toBeNull();
  });
});

describe("isTrustedHost", () => {
  const domains = ["access-ci.org"];

  it("trusts the domain and its subdomains", () => {
    expect(isTrustedHost("access-ci.org", domains)).toBe(true);
    expect(isTrustedHost("support.access-ci.org", domains)).toBe(true);
  });

  it("doesn't trust look-alikes", () => {
    expect(isTrustedHost("access-ci.org.evil.com", domains)).toBe(false);
    expect(isTrustedHost("evilaccess-ci.org", domains)).toBe(false);
    expect(isTrustedHost("evil.com", domains)).toBe(false);
  });
});

describe("isSameOriginSrc", () => {
  it("allows relative paths and the page's own origin", () => {
    expect(isSameOriginSrc("/logo.png", origin)).toBe(true);
    expect(isSameOriginSrc("https://qa.access-ci.org/x.png", origin)).toBe(
      true,
    );
  });

  it("refuses other sites, protocol-relative URLs and data URLs", () => {
    expect(isSameOriginSrc("https://evil.com/x.png?d=1", origin)).toBe(false);
    expect(isSameOriginSrc("//evil.com/x.png", origin)).toBe(false);
    expect(isSameOriginSrc("data:image/png;base64,AAAA", origin)).toBe(false);
    expect(isSameOriginSrc("javascript:alert(1)", origin)).toBe(false);
  });
});
