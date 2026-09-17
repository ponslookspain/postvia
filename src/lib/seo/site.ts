/**
 * Single canonical identity source for every public marketing surface.
 * Canonicals, OpenGraph URLs, JSON-LD ids, sitemap and robots all read
 * from here — never from request headers.
 */
export const SITE_ORIGIN = "https://postvia.online";
export const SITE_NAME = "Postvia";
export const SITE_LOCALE = "en_US";

export type MarketingRoute = {
  path: string;
  priority: number;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
};

/** Public, indexable marketing routes. Private app routes are excluded. */
export const PUBLIC_ROUTES: MarketingRoute[] = [
  { path: "/", priority: 1.0, changeFrequency: "weekly" },
  { path: "/features", priority: 0.9, changeFrequency: "weekly" },
  { path: "/social-media-scheduler", priority: 0.9, changeFrequency: "monthly" },
  { path: "/social-media-calendar", priority: 0.9, changeFrequency: "monthly" },
  { path: "/cross-platform-publishing", priority: 0.9, changeFrequency: "monthly" },
  { path: "/bulk-social-media-scheduling", priority: 0.8, changeFrequency: "monthly" },
  { path: "/platform-previews", priority: 0.8, changeFrequency: "monthly" },
  { path: "/platforms/instagram", priority: 0.8, changeFrequency: "monthly" },
  { path: "/platforms/tiktok", priority: 0.8, changeFrequency: "monthly" },
  { path: "/platforms/threads", priority: 0.8, changeFrequency: "monthly" },
  { path: "/platforms/x", priority: 0.8, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.8, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
];

/** App/auth/api routes that must never appear in the sitemap. */
export const PRIVATE_ROUTE_PREFIXES = [
  "/dashboard",
  "/posts",
  "/calendar",
  "/accounts",
  "/settings",
  "/billing",
  "/login",
  "/signup",
  "/onboarding",
  "/verify-",
  "/post-auth",
  "/api",
];

export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_ORIGIN}/#organization`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    logo: `${SITE_ORIGIN}/icon.svg`,
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_ORIGIN}/#website`,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}

export function softwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description:
      "Write once, customize for every platform, and schedule content from one workspace. Instagram, Threads, TikTok and X.",
    url: SITE_ORIGIN,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Free", price: "0", priceCurrency: "EUR" },
      { "@type": "Offer", name: "Growth", price: "20", priceCurrency: "EUR" },
      { "@type": "Offer", name: "Scale", price: "50", priceCurrency: "EUR" },
    ],
    publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  };
}

export function breadcrumbSchema(
  items: { name: string; path?: string }[]
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      ...(item.path ? { item: absoluteUrl(item.path) } : {}),
    })),
  };
}

export function faqPageSchema(faqs: { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };
}
