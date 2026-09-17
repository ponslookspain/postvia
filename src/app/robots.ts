import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo/site";

/**
 * Crawlers may index the marketing surface and legal pages only.
 * Every private or auth route is disallowed; the sitemap lists
 * exclusively the public set so nothing private is advertised.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/posts/",
          "/posts",
          "/calendar",
          "/accounts",
          "/settings",
          "/billing",
          "/login",
          "/signup",
          "/onboarding",
          "/verify-otp",
          "/verify-email",
          "/post-auth",
        ],
      },
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}
