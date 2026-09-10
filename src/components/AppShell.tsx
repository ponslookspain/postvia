import { Sidebar } from "@/components/Sidebar";
import type { AuthUser } from "@/lib/auth";

export function AppShell({
  user,
  children,
}: {
  user: Pick<AuthUser, "name" | "email">;
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar userName={user.name} userEmail={user.email} />
      <main className="flex-1 min-h-screen">{children}</main>
    </div>
  );
}