import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { parsePlanParam } from "@/lib/plans";
import { SignupForm } from "./SignupForm";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const plan =
    typeof params.plan === "string" ? parsePlanParam(params.plan) : null;

  return <SignupForm plan={plan} />;
}
