"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, SparklesIcon } from "lucide-react";
import { cn } from "cn";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import type { PlanId } from "@/lib/plans";
import { isActivePath, navItems } from "@/components/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function Sidebar({
  userName,
  userEmail,
  plan,
  className,
}: {
  userName: string;
  userEmail: string;
  plan: PlanId;
  className?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const initial = userName.trim().charAt(0).toUpperCase() || "U";

  async function handleSignOut() {
    try {
      const result = await authClient.signOut();
      if (result?.error) {
        throw new Error(
          typeof result.error.message === "string"
            ? result.error.message
            : "Sign out failed"
        );
      }
    } catch {
      toast.add({
        title: "Could not sign out",
        description: "Your session is still active. Please try again.",
        type: "error",
      });
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "h-screen shrink-0 flex-col border-r border-border bg-background sticky top-0 transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-16" : "w-60",
        className
      )}
    >
      <div
        className={cn(
          "flex border-b border-border",
          collapsed ? "flex-col items-center gap-1 p-3" : "items-center justify-between p-6"
        )}
      >
        {collapsed ? (
          <p aria-hidden="true" className="text-lg font-semibold tracking-tight">
            p
          </p>
        ) : (
          <p className="text-lg font-semibold tracking-tight">postvia</p>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </Button>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = isActivePath(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                collapsed && "justify-center px-0",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate transition-opacity duration-200 motion-reduce:transition-none",
                  collapsed && "sr-only"
                )}
              >
                {item.label}
              </span>
              {collapsed && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute left-full z-50 ml-2 rounded-md border border-border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
                >
                  {item.label}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {plan === "free" && !collapsed && (
        <div className="px-3 pb-1">
          <Link
            href="/billing"
            className="block rounded-lg border border-border bg-muted/40 p-3 outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <SparklesIcon className="size-4 shrink-0" aria-hidden="true" />
              Unlock more with Postvia
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              More posts, more accounts and Bulk scheduling.
            </p>
            <p className="mt-2 text-xs font-medium underline underline-offset-4">
              View plans
            </p>
          </Link>
        </div>
      )}
      <div className={cn("border-t border-border", collapsed ? "p-3" : "p-4")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {userEmail}
              </p>
            </div>
          )}
        </div>
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void handleSignOut()}
            aria-label="Sign out"
            title="Sign out"
            className="mt-3 w-full"
          >
            <LogOutIcon />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleSignOut()}
            className="mt-3 w-full justify-start"
          >
            Sign out
          </Button>
        )}
        {!collapsed && (
          <>
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
          </>
        )}
      </div>
    </aside>
  );
}
