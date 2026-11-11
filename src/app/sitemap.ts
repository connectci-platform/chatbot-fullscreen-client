import type { MetadataRoute } from "next";
import { program } from "@/config/program";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: new URL("/", program.siteUrl).toString() }];
}
