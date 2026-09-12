"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarIcon,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/posts", label: "Posts", icon: FileTextIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/posts/new", label: "Create", icon: PlusIcon },
  { href: "/accounts", label: "Accounts", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

function isActivePath(pathname: string, href: string) {
  return (
    pathname === href ||
    (href === "/posts" &&
      pathname.startsWith("/posts") &&
      pathname !== "/posts/new")
  );
}

export function MobileTopBar({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
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
    <header className="sticky top-0 z-40 border-b border-border bg-background md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="text-base font-semibold tracking-tight">postvia</p>
        <Popover>
          <PopoverTrigger
            aria-label="Account menu"
            render={
              <button
                type="button"
                className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              />
            }
          >
            <Avatar>
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleSignOut()}
              className="mt-3 w-full"
            >
              Sign out
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <nav
        aria-label="Primary"
        className="flex gap-1 overflow-x-auto px-3 pb-3"
      >
        {navItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
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
    </header>
  );
}
