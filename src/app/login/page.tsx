import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const deleted = params.deleted === "1";
  const passwordChanged = params.passwordChanged === "1";

  return <LoginForm deleted={deleted} passwordChanged={passwordChanged} />;
}