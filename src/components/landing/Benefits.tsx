import {
  CalendarClockIcon,
  ClapperboardIcon,
  ImageIcon,
  KeyRoundIcon,
  PenLineIcon,
  WorkflowIcon,
  HardDriveIcon,
} from "lucide-react";
import { Reveal } from "@/components/landing/Reveal";

const benefits = [
  {
    icon: WorkflowIcon,
    title: "One workflow",
    text: "Draft, preview, schedule and publish without leaving the workspace.",
  },
  {
    icon: PenLineIcon,
    title: "Write once, customize per platform",
    text: "A global caption with per-account overrides for text, titles and TikTok settings.",
  },
  {
    icon: CalendarClockIcon,
    title: "Visual content calendar",
    text: "Every scheduled post on a month grid. Drag it to another day to reschedule.",
  },
  {
    icon: ClapperboardIcon,
    title: "Bulk video scheduling",
    text: "Drop up to 10 videos, pick a start and an interval — one scheduled post each.",
  },
  {
    icon: ImageIcon,
    title: "Text, image and video posts",
    text: "Photos up to 10 MB, video up to 100 MB, with live per-platform previews.",
  },
  {
    icon: KeyRoundIcon,
    title: "Secure OAuth connections",
    text: "No social passwords stored. Tokens only, disconnect anytime.",
  },
  {
    icon: HardDriveIcon,
    title: "Optimized media storage",
    text: "Private store, canonical optimized copies, orphans swept, deleted with the post.",
  },
];

export function Benefits() {
  return (
    <section id="product" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-8 md:py-20">
      <Reveal className="max-w-2xl">
        <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">
          Everything publishing needs, in one calm place.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          No tab-hopping between apps. No copy-paste. No lost drafts.
        </p>
      </Reveal>
      <div className="mt-10">
        {benefits.map((benefit, index) => (
          <Reveal key={benefit.title} delayMs={Math.min(index * 40, 200)}>
            <div className="flex items-start gap-4 border-t border-border py-5 last:border-b md:gap-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                <benefit.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 md:flex md:flex-1 md:items-baseline md:gap-6">
                <h3 className="shrink-0 text-base font-medium md:w-64">
                  {benefit.title}
                </h3>
                <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground md:mt-0">
                  {benefit.text}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
