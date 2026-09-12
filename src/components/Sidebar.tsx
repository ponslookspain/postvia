"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  FileTextIcon,
  LayoutGridIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import { cn } from "cn";
import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/posts", label: "Posts", icon: FileTextIcon },
  { href: "/posts/new", label: "Create post", icon: PlusIcon },
  { href: "/accounts", label: "Accounts", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar({
  userName,
  userEmail,
  className,
}: {
  userName: string;
  userEmail: string;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initial = userName.trim().charAt(0).toUpperCase() || "U";

  async function handleSignOut() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "h-screen w-60 shrink-0 flex-col border-r border-border bg-background sticky top-0",
        className
      )}
    >
      <div className="border-b border-border p-6">
        <p className="text-lg font-semibold tracking-tight">postvia</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/posts" &&
              pathname.startsWith("/posts") &&
              pathname !== "/posts/new");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-sm">
            <p className="truncate font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleSignOut()}
          className="mt-3 w-full justify-start"
        >
          Sign out
        </Button>
        <Separator className="my-3" />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link
            href="/terms"
            className="transition-colors hover:text-foreground"
          >
            Terms
          </Link>
          <span aria-hidden="true">&middot;</span>
          <Link
            href="/privacy"
            className="transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
        </div>
      </div>
    </aside>
  );
}
