import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Hero } from "@/components/landing/Hero";
import { TrustBar } from "@/components/landing/TrustBar";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TailorPreview } from "@/components/landing/TailorPreview";
import { CalendarBulk } from "@/components/landing/CalendarBulk";
import { Reliability } from "@/components/landing/Reliability";
import { HomeFeatures, HomePlatforms, HomeResources } from "@/components/landing/MarketingHub";
import { Pricing } from "@/components/landing/Pricing";
import { Faq, FinalCta, Footer } from "@/components/landing/Faq";
import {
  organizationSchema,
  serializeJsonLd,
  softwareApplicationSchema,
  websiteSchema,
} from "@/lib/seo/site";

export const metadata: Metadata = {
  title: "Postvia — Publish everywhere. Stay in one place.",
  description:
    "Write once, customize for every platform, and schedule your content from one workspace. Instagram, Threads, TikTok and X. Free plan with 15 posts per month, no credit card required.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Postvia — Publish everywhere. Stay in one place.",
    description:
      "Write once, customize for every platform, and schedule your content from one workspace. Instagram, Threads, TikTok and X.",
    url: "/",
    type: "website",
    siteName: "Postvia",
  },
  twitter: {
    card: "summary",
    title: "Postvia — Publish everywhere. Stay in one place.",
    description:
      "Write once, customize for every platform, and schedule your content from one workspace.",
  },
};

export default function HomePage() {
  // Static landing shell. Only NavbarState reads the session (inside a
  // Suspense boundary); /dashboard stays a separate route.
  return (
    <div className="min-h-screen overflow-x-clip bg-background font-sans text-foreground antialiased">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteSchema()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationSchema()) }}
      />
      <NavbarState />
      <main>
        <Hero />
        <TrustBar />
        <Problem />
        <HowItWorks />
        <TailorPreview />
        <CalendarBulk />
        <Reliability />
        <HomePlatforms />
        <HomeFeatures />
        <Pricing />
        <Faq />
        <HomeResources />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
