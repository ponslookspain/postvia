import { parsePlanParam } from "@/lib/plans";
import { WelcomeForm } from "./WelcomeForm";

export const dynamic = "force-dynamic";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialPlan =
    typeof params.plan === "string"
      ? (parsePlanParam(params.plan) ?? "growth")
      : "growth";

  return <WelcomeForm initialPlan={initialPlan} />;
}
