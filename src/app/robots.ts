import type { MetadataRoute } from "next";
import { program } from "@/config/program";

export default function robots(): MetadataRoute.Robots {
  return {
    // The agent's API shares the host under /api.
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", program.siteUrl).toString(),
  };
}
