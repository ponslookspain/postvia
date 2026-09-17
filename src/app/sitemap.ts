import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_ORIGIN } from "@/lib/seo/site";

/**
 * Indexable marketing routes only. Private app routes (/dashboard,
 * /posts, /calendar, /accounts, /settings, /billing, auth pages,
 * /api) are excluded here AND disallowed in robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((route) => ({
    url: `${SITE_ORIGIN}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
