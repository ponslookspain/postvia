import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, DM_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const dmSansHeading = DM_Sans({subsets:['latin'],variable:'--font-heading'});

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://postvia.online"),
  title: {
    default: "Postvia",
    template: "%s — Postvia",
  },
  description: "Create and publish content to social media",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    siteName: "Postvia",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", inter.variable, dmSansHeading.variable)}
    >
      <body className="min-h-full bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}