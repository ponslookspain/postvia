import type { LucideIcon } from "lucide-react";
import {
  CalendarDaysIcon,
  CalendarClockIcon,
  LayersIcon,
  ListVideoIcon,
  EyeIcon,
  PenLineIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

export type FeatureCategory = "Plan & publish" | "Create" | "Platforms";

export type FeatureLink = {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  category: FeatureCategory;
};

export type PlatformLink = {
  title: string;
  description: string;
  href: string;
  platform: "INSTAGRAM" | "TIKTOK" | "THREADS" | "X";
};

/** Single taxonomy shared by the mega menu, /features hub and Home. */
export const PLAN_PUBLISH_FEATURES: FeatureLink[] = [
  {
    title: "Social Media Scheduler",
    description: "Schedule Instagram, Threads and TikTok from one queue.",
    href: "/social-media-scheduler",
    icon: CalendarClockIcon,
    category: "Plan & publish",
  },
  {
    title: "Content Calendar",
    description: "Month view with drafts, statuses and drag-to-reschedule.",
    href: "/social-media-calendar",
    icon: CalendarDaysIcon,
    category: "Plan & publish",
  },
  {
    title: "Cross-Platform Publishing",
    description: "Create once, tailor per network, publish everywhere.",
    href: "/cross-platform-publishing",
    icon: LayersIcon,
    category: "Plan & publish",
  },
  {
    title: "Bulk Scheduling",
    description: "Turn up to 10 videos into a full posting schedule.",
    href: "/bulk-social-media-scheduling",
    icon: ListVideoIcon,
    category: "Plan & publish",
  },
];

export const CREATE_FEATURES: FeatureLink[] = [
  {
    title: "Platform Previews",
    description: "See each network's version before anything goes live.",
    href: "/platform-previews",
    icon: EyeIcon,
    category: "Create",
  },
  {
    title: "Multi-Platform Composer",
    description: "One caption with shared text and media attachment.",
    href: "/cross-platform-publishing",
    icon: PenLineIcon,
    category: "Create",
  },
  {
    title: "Per-Platform Customization",
    description: "Overrides, TikTok titles and limits per account.",
    href: "/platform-previews",
    icon: SlidersHorizontalIcon,
    category: "Create",
  },
];

/** Hub cards: one entry per indexable feature page (no duplicates). */
export const FEATURE_HUB_CARDS: FeatureLink[] = [
  ...PLAN_PUBLISH_FEATURES,
  CREATE_FEATURES[0]!,
];

export const PLATFORM_LINKS: PlatformLink[] = [
  {
    title: "Instagram",
    description: "Photos and Reels with captions up to 2,200 characters.",
    href: "/platforms/instagram",
    platform: "INSTAGRAM",
  },
  {
    title: "TikTok",
    description: "Video and photo posts with titles and privacy controls.",
    href: "/platforms/tiktok",
    platform: "TIKTOK",
  },
  {
    title: "Threads",
    description: "Text posts up to 500 characters with one image or video.",
    href: "/platforms/threads",
    platform: "THREADS",
  },
  {
    title: "X",
    description: "Immediate publishing for short posts with media.",
    href: "/platforms/x",
    platform: "X",
  },
];
