import type { Metadata } from "next";
import { NavbarState } from "@/components/landing/NavbarState";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { TailorPreview } from "@/components/landing/TailorPreview";
import { CalendarBulk } from "@/components/landing/CalendarBulk";
import { Reliability } from "@/components/landing/Reliability";
import { Pricing } from "@/components/landing/Pricing";
import { Faq, FinalCta, Footer } from "@/components/landing/Faq";

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
    <div className="min-h-screen overflow-x-clip bg-background text-foreground antialiased">
      <NavbarState />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <TailorPreview />
        <CalendarBulk />
        <Reliability />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
