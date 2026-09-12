import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Benefits } from "@/components/landing/Benefits";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Stories } from "@/components/landing/Stories";
import { Comparison, Platforms, Pricing } from "@/components/landing/Sections";
import { Faq, FinalCta, Footer } from "@/components/landing/Faq";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Postvia — Publish everywhere. Stay in one place.",
  description:
    "Write once, customize for every platform, and schedule your content from one workspace. Instagram, Threads, TikTok and X.",
  openGraph: {
    title: "Postvia — Publish everywhere. Stay in one place.",
    description:
      "Write once, customize for every platform, and schedule your content from one workspace.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Postvia — Publish everywhere. Stay in one place.",
    description:
      "Write once, customize for every platform, and schedule your content from one workspace.",
  },
};

export default async function HomePage() {
  // The root route always renders the public landing — including for
  // signed-in visitors. /dashboard stays a separate route.
  const user = await getSessionUser();

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground antialiased">
      <Navbar isLoggedIn={user !== null} />
      <main>
        <Hero />
        <Benefits />
        <HowItWorks />
        <Stories />
        <Platforms />
        <Comparison />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
