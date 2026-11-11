import { generateMetadata } from "./page";
import robots from "./robots";
import sitemap from "./sitemap";

vi.mock("./chat-page", () => ({ ChatPage: () => null }));

const withParams = (params: Record<string, string>) => ({
  searchParams: Promise.resolve(params),
});

describe("page metadata", () => {
  it("keeps a conversation link out of search results", async () => {
    expect(await generateMetadata(withParams({ threadId: "abc" }))).toEqual({
      robots: { index: false, follow: false },
    });
  });

  it("leaves the start screen indexable", async () => {
    expect(await generateMetadata(withParams({}))).toEqual({});
  });
});

describe("robots.txt and sitemap", () => {
  it("allows the site, skips the API, and names the sitemap", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: "/api/" },
      sitemap: "https://qa.access-ci.org/sitemap.xml",
    });
  });

  it("lists only the start screen", () => {
    expect(sitemap()).toEqual([{ url: "https://qa.access-ci.org/" }]);
  });
});
