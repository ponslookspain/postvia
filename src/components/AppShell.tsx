import { Sidebar } from "@/components/Sidebar";
import { MobileTopBar } from "@/components/MobileTopBar";
import type { AuthUser } from "@/lib/auth";

export function AppShell({
  user,
  children,
}: {
  user: Pick<AuthUser, "name" | "email">;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen md:flex">
      <Sidebar
        userName={user.name}
        userEmail={user.email}
        className="hidden md:flex"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar userName={user.name} userEmail={user.email} />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
