# Postvia SEO & marketing architecture

Single source of truth for the public marketing surface: information
architecture, URL strategy, metadata conventions, internal linking,
sitemap/robots rules, and future expansion. Code truth lives in
`src/lib/seo/site.ts` (canonical origin, public route list, JSON-LD
builders) and `src/components/marketing/marketing-data.ts` (features
and platform taxonomy).

## 1. Starting point (before this work)

- One landing page (`/`) with anchor navigation (`#product`, `#how`,
  `#calendar`, `#pricing`, `#faq`). No `/features`, no `/pricing`
  route, no platform or feature pages.
- Metadata only on `/` (`metadataBase https://postvia.online`,
  `canonical: "/"`). No sitemap, no robots, no JSON-LD.
- Navbar had no links to real pages; footer linked anchors + legal.
- Private app routes (`/dashboard`, `/posts`, `/calendar`,
  `/accounts`, `/settings`, `/billing`, auth pages, `/api`) had no
  crawler policy at all.

## 2. New information architecture

```
/                              conversion hub (existing flow + hub blocks)
/features                      capability map (hub, not an article)
/social-media-scheduler        flat feature pages (search intent)
/social-media-calendar
/cross-platform-publishing
/bulk-social-media-scheduling
/platform-previews
/platforms/instagram           nested platform guides
/platforms/tiktok
/platforms/threads
/platforms/x
/pricing                       canonical plan page
/terms, /privacy               legal (as before)
```

Home flow is preserved and extended:

```
Hero → Trust → Problem → How it works → Product → Calendar →
Reliability → Supported Platforms → Explore Features → Pricing →
FAQ → Learn (resources) → CTA
```

Roles: Home converts; `/features` maps; feature pages capture
search/product intent; platform pages capture platform-specific
intent; a future `/blog` becomes the content acquisition layer
(not built yet — no empty pages by policy).

## 3. URL strategy and canonical decisions

- **One indexable URL per intent.** Feature capabilities live FLAT
  in the root (`/social-media-scheduler`) because these are short
  head queries where URL brevity helps. There is deliberately no
  `/features/social-media-scheduler` twin.
- **Platforms live NESTED** (`/platforms/instagram`) so future
  networks (Facebook, YouTube, LinkedIn, Pinterest) extend the group
  without root collisions.
- **No `/instagram-scheduler`-style aliases.** If a short alias is
  ever wanted, it must be a `308` redirect to the canonical page in
  `next.config.ts` — never a second indexable page. Duplicate
  indexables with one intent are the failure mode this rule exists
  to prevent.
- **X honesty rule.** X publishes immediately (enforced in
  `src/lib/schedule.ts` + `POST /api/posts`). The X page is titled
  and messaged as *publishing*, never *scheduling* — SEO copy must
  never promise a missing feature.
- **Scope honesty (all platforms).** Instagram: no Stories,
  carousels, alt text. Threads: single media only, no carousels.
  Copy states these boundaries; the composer fails closed on them.

## 4. Features taxonomy

Single definition: `src/components/marketing/marketing-data.ts`.
Consumed by the mega menu, `/features`, and Home blocks — add a
capability once, it appears everywhere.

- **Plan & publish:** Social Media Scheduler, Content Calendar,
  Cross-Platform Publishing, Bulk Scheduling → each has its own page.
- **Create:** Platform Previews (own page), Multi-Platform Composer
  (→ `/cross-platform-publishing`), Per-Platform Customization
  (→ `/platform-previews`). No thin duplicate pages for subsections.
- **Platforms:** Instagram, TikTok, Threads, X → each has its own
  `/platforms/*` guide.

## 5. Platform taxonomy

Source of product truth is the capabilities registry
(`src/lib/platforms/capabilities.ts`): text limits (Threads 500, X
280, Instagram caption 2200, TikTok title/description rules), media
matrix (Instagram JPEG/MP4 single; TikTok video or 1–4 photos;
Threads single item; X up to 4 photos / 1 GIF / 1 video), TikTok
privacy/duet/stitch/comments/cover options, X-scheduling ban.
Platform pages mirror this registry; any registry change should
trigger a copy review of the matching page.

## 6. SEO page map

| Page | Intent | H1 |
|---|---|---|
| `/` | brand + conversion | Publish everywhere. Stay in one place. |
| `/features` | capability map | Everything Postvia does, on one map. |
| `/social-media-scheduler` | social media scheduler | A scheduler that treats every network honestly. |
| `/social-media-calendar` | social media calendar | The month, visible in one grid. |
| `/cross-platform-publishing` | cross platform publishing | Create once. Fit every network. |
| `/bulk-social-media-scheduling` | bulk scheduling | Ten videos in. A schedule out. |
| `/platform-previews` | previews/validation | Approve the post you will actually publish. |
| `/platforms/instagram` | instagram scheduler | Instagram, scheduled without the juggling. |
| `/platforms/tiktok` | tiktok scheduler | TikTok, with the settings TikTok actually offers. |
| `/platforms/threads` | threads scheduler | Threads, where the long version lives. |
| `/platforms/x` | publish to X | X, published now — honestly. |
| `/pricing` | pricing | Start free. Pay when volume says so. |

## 7. Metadata conventions

- Every public page exports `metadata`: unique `title` (with the
  `— Postvia` template), unique `description`, self `canonical`,
  OpenGraph (`title`, `description`, `url` from `absoluteUrl()`,
  `siteName: Postvia`) and Twitter `summary` card.
- Canonical origin is `SITE_ORIGIN = https://postvia.online`
  (`src/lib/seo/site.ts`); `www` 308-redirects to apex
  (`next.config.ts`). Never build public URLs from request headers.
- `lang="en"`, single H1 per page, H2 hierarchy without skipped
  levels, answer-first paragraphs.

## 8. Structured data

Minimal and matched to visible content (builders in
`src/lib/seo/site.ts`, serialized with `<`-escaping):

- Home: `Organization` + `WebSite` + `SoftwareApplication` (offers
  mirror the published Free/Growth/Scale prices from
  `src/lib/plans.ts`).
- `/pricing`: `SoftwareApplication` (same offers).
- Every feature/platform page: `BreadcrumbList`.
- Every page with a visible FAQ section: `FAQPage` (Home FAQ block
  is a landing component without schema — schema lives where the
  FAQ content is page-specific and visible).
- No `Article`, no invented organization details, no draft prices.

## 9. Internal linking rules

- Home → `/features`, feature pages, platform pages, `/pricing`
  (new Supported Platforms / Explore Features / Learn blocks).
- `/features` → all feature pages + all platform pages.
- Feature pages → 3 related pages each (related features +
  relevant platform), with descriptive anchor text.
- Platform pages → relevant scheduler/calendar/publishing pages.
- Mega menu + footer mirror the taxonomy with real `href`s only —
  no fake links, no dead Blog entry until content exists.
- Anchor text is descriptive ("Bulk scheduling turns up to 10
  videos…", never "click here").

## 10. Sitemap and robots rules

- `src/app/sitemap.ts` enumerates `PUBLIC_ROUTES` from
  `src/lib/seo/site.ts` (12 marketing pages + terms/privacy) with
  `changeFrequency`/`priority`. To add a page: append one entry.
- `src/app/robots.ts` allows `/`, disallows `/api/`,
  `/dashboard`, `/posts`, `/calendar`, `/accounts`, `/settings`,
  `/billing`, `/login`, `/signup`, `/onboarding`, `/verify-*`,
  `/post-auth`, and advertises the sitemap.
- Private routes are excluded from the sitemap AND disallowed in
  robots — the two lists are reviewed together. Per-page `noindex`
  was deliberately not scattered across ~14 app pages; robots
  disallow is the single enforcement point (documented here so a
  future change re-examines both files).

## 11. Components

`src/components/marketing/`: `marketing-data.ts` (taxonomy),
`MarketingHero.tsx` (breadcrumbs + H1 header), `MarketingCards.tsx`
(`FeatureGrid`, `PlatformGrid`, `RelatedLinks`),
`MarketingFaq.tsx` (client accordion, same a11y pattern as landing
FAQ), `MarketingCta.tsx` (+ `MarketingShell`). Landing reuse:
`NavbarState`, `Footer`, `Pricing`, `Reveal`, `PlatformIcon`,
`Button`, `Badge`. No new design tokens — semantic colors, panel
tiles, DM Sans headings + Inter body, Lucide icons only.

## 12. Future pages (not built)

- `/for-creators`, `/for-agencies`, `/for-small-business`
  (persona layer under consideration).
- `/guides/...` how-to library feeding the Learn block.
- `/blog/...` content acquisition layer — Navbar and footer
  reserve no dead links until the first posts exist; adding the
  blog means: new `PUBLIC_ROUTES` entries, hub + article template
  with `Article` schema, and mega-menu/footer updates from
  `marketing-data.ts`.
- New platforms (Facebook, YouTube, LinkedIn, Pinterest):
  registry entry first, then `/platforms/<slug>` following the
  existing page pattern.
