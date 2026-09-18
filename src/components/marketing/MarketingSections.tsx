import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/PlatformIcon";
import { cn } from "@/lib/utils";

/**
 * Editorial marketing sections. One dominant visual per page, quiet
 * structure elsewhere: hairline rows instead of card grids where the
 * content is a list, asymmetric splits where a visual needs room.
 * No new tokens — panel, muted, border, primary only.
 */

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {index > 0 && (
                <span aria-hidden="true" className="text-muted-foreground/60">/</span>
              )}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn(last && "text-foreground")}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHero({
  eyebrow,
  title,
  description,
  breadcrumbs,
  visual,
  meta,
  secondaryHref,
  secondaryLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  breadcrumbs: { label: string; href?: string }[];
  visual?: React.ReactNode;
  meta?: { label: string; value: string }[];
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  if (!visual) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-12 md:px-8 md:pt-16 md:pb-16">
        <Breadcrumbs items={breadcrumbs} />
        <div className="mt-8 max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
          <MetaRow meta={meta} />
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-12 md:px-8 md:pt-16 md:pb-20">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{eyebrow}</p>
          <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            {title}
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            {description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" nativeButton={false} render={<Link href="/signup" />}>
              Get started free
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            {secondaryHref && secondaryLabel && (
              <Button size="lg" variant="outline" nativeButton={false} render={<Link href={secondaryHref} />}>
                {secondaryLabel}
              </Button>
            )}
          </div>
          <MetaRow meta={meta} />
        </div>
        <div className="min-w-0">{visual}</div>
      </div>
    </div>
  );
}

function MetaRow({ meta }: { meta?: { label: string; value: string }[] }) {
  if (!meta || meta.length === 0) return null;
  return (
    <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-5">
      {meta.map((item) => (
        <div key={item.label}>
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 font-mono text-label text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Asymmetric text/visual split. `flip` alternates the rhythm per page. */
export function SplitSection({
  title,
  children,
  visual,
  flip = false,
  caption,
}: {
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
  flip?: boolean;
  caption?: string;
}) {
  return (
    <section aria-label={title} className="border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-2 lg:gap-14">
        <div className={`min-w-0 ${flip ? "lg:order-2" : ""}`}>
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {title}
          </h2>
          <div className="mt-4 max-w-xl space-y-3 leading-relaxed text-muted-foreground">
            {children}
          </div>
        </div>
        <div className={`min-w-0 ${flip ? "lg:order-1" : ""}`}>
          {visual}
          {caption && (
            <p className="mt-3 text-xs text-muted-foreground">{caption}</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Full-width dominant visual with a quiet caption. */
export function FullVisual({
  title,
  intro,
  visual,
  caption,
}: {
  title: string;
  intro?: string;
  visual: React.ReactNode;
  caption?: string;
}) {
  return (
    <section aria-label={title} className="border-t border-border bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 md:px-8 md:py-20">
        <div className="max-w-2xl">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {title}
          </h2>
          {intro && (
            <p className="mt-3 max-w-xl leading-relaxed text-muted-foreground">{intro}</p>
          )}
        </div>
        <div className="mt-8">{visual}</div>
        {caption && (
          <p className="mt-3 text-xs text-muted-foreground">{caption}</p>
        )}
      </div>
    </section>
  );
}

/** Hairline-row list for supporting capabilities — no cards. */
export function QuietRows({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: { title: string; text: string; href?: string }[];
}) {
  return (
    <section aria-label={title} className="border-t border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 md:px-8 md:py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
        <div className="min-w-0">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance md:text-3xl">
            {title}
          </h2>
          {intro && (
            <p className="mt-3 max-w-md leading-relaxed text-muted-foreground">{intro}</p>
          )}
        </div>
        <dl className="min-w-0 border-t border-border">
          {items.map((item) => (
            <div key={item.title} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,5fr)] sm:gap-6">
              <dt className="font-heading text-base font-semibold tracking-tight">
                {item.href ? (
                  <Link
                    href={item.href}
                    className="group inline-flex items-center gap-1 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    {item.title}
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-4 text-primary transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:transform-none"
                    />
                  </Link>
                ) : (
                  item.title
                )}
              </dt>
              <dd className="text-sm leading-relaxed text-muted-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/**
 * Faithful single-platform post mock. Mirrors the real preview rail
 * (handle, adapted text, media block, limit counter) — parameterized,
 * never a screenshot, never a fake platform theme.
 */
export function PlatformMock({
  platform,
  handle,
  text,
  counter,
  mediaLabel,
  foot,
}: {
  platform: "INSTAGRAM" | "TIKTOK" | "THREADS" | "X";
  handle: string;
  text: string;
  counter: string;
  mediaLabel: string;
  foot: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${handle} post preview: ${counter}, ${mediaLabel}`}
      className="overflow-hidden rounded-2xl bg-panel text-left"
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3 md:px-5">
          <PlatformIcon platform={platform} className="size-4" />
          <p className="truncate text-sm font-medium">{handle}</p>
          <p className="ml-auto shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {counter}
          </p>
        </div>
        <p className="px-4 pt-4 text-prose leading-relaxed md:px-5">{text}</p>
        <div className="px-4 pt-3 md:px-5">
          <div className="flex h-28 items-center justify-center rounded-xl bg-background text-xs text-muted-foreground">
            {mediaLabel}
          </div>
        </div>
        <p className="border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground md:px-5">
          {foot}
        </p>
      </div>
    </div>
  );
}
