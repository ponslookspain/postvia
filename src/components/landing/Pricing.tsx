import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/plans";

const quotaLine: Record<string, string> = {
  free: "15 posts/month · 1 connected account",
  growth: "300 posts/month · up to 5 connected accounts",
  scale: "Unlimited posts · unlimited connected accounts",
};

const descriptionOverride: Record<string, string> = {
  free: "Start publishing without a card.",
  growth: "For creators and small teams publishing every week.",
  scale: "For higher-volume publishing across more accounts.",
};

export function Pricing() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14 md:px-8 md:py-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          id="pricing-heading"
          className="text-3xl font-semibold tracking-tight text-balance md:text-4xl"
        >
          Start free. Upgrade when you need more.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          Use Postvia on the Free plan, then add more accounts, posts, and
          bulk scheduling as your publishing volume grows.
        </p>
      </div>
      <div className="mt-10 grid items-stretch gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "flex h-full flex-col rounded-xl border bg-card p-6",
              plan.highlighted
                ? "border-primary ring-1 ring-primary/30"
                : "border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-medium">{plan.name}</h3>
              {plan.highlighted && <Badge>Most popular</Badge>}
            </div>
            <p className="mt-4">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                ${plan.price}
              </span>{" "}
              <span className="text-sm text-muted-foreground">/ month</span>
            </p>
            <p className="mt-2 text-sm font-medium">{quotaLine[plan.id]}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {descriptionOverride[plan.id] ?? plan.description}
            </p>
            <ul className="mt-5 flex flex-col gap-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm">
                  <CheckIcon
                    className="mt-0.5 size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              nativeButton={false}
              render={
                <Link
                  href={
                    plan.id === "free" ? "/signup" : `/signup?plan=${plan.id}`
                  }
                />
              }
              variant={plan.highlighted ? "default" : "outline"}
              className="mt-6 w-full"
            >
              {plan.id === "free" ? "Get started free" : `Choose ${plan.name}`}
            </Button>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
        Bulk video scheduling supports up to 10 videos per batch on Growth
        and Scale.
      </p>
    </section>
  );
}
