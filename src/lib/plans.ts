/**
 * Pricing plans (TEST MODE — no billing backend, no Stripe, no payment).
 *
 * Plans are marketing-level only: the selected id travels
 * landing -> signup (?plan=) -> welcome (?plan= + localStorage) and is
 * shown preselected on plan selection. Confirming always lands on
 * /dashboard. Nothing is charged and no card is ever asked for.
 */

export type PlanId = "starter" | "growth" | "scale";

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  description: string;
  features: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 10,
    description: "For trying the full workflow on your own channels.",
    features: [
      "Publish to Instagram, Threads, TikTok and X",
      "Schedule posts ahead",
      "Per-platform previews",
      "1 connected account per platform",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: 20,
    description: "For creators publishing every week.",
    features: [
      "Everything in Starter",
      "Visual content calendar",
      "Bulk video scheduling up to 10 videos",
      "Multiple accounts per platform",
      "Retry and reschedule controls",
    ],
    highlighted: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 50,
    description: "For teams and heavy schedules.",
    features: [
      "Everything in Growth",
      "Unlimited scheduled posts",
      "Priority publishing queue",
      "All current and future platforms",
    ],
  },
];

export const PLAN_STORAGE_KEY = "postvia:selected-plan";

export function parsePlanParam(raw: unknown): PlanId | null {
  if (raw === "starter" || raw === "growth" || raw === "scale") return raw;
  return null;
}

export function getPlan(id: PlanId): Plan {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[1];
}
