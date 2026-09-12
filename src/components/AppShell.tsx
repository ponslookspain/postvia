import { Sidebar } from "@/components/Sidebar";
import { MobileTopBar } from "@/components/MobileTopBar";
import type { AuthUser } from "@/lib/auth";
import { getEffectivePlan } from "@/lib/entitlements";

export async function AppShell({
  user,
  children,
}: {
  user: Pick<AuthUser, "id" | "name" | "email">;
  children: React.ReactNode;
}) {
  const effective = await getEffectivePlan({
    userId: user.id,
    userEmail: user.email,
  });
  return (
    <div className="min-h-screen md:flex">
      <Sidebar
        userName={user.name}
        userEmail={user.email}
        plan={effective.bypass ? "scale" : effective.plan}
        className="hidden md:flex"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar userName={user.name} userEmail={user.email} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
