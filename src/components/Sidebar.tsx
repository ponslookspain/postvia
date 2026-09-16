"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOutIcon, SparklesIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import type { PlanId } from "@/lib/plans";
import { isActivePath, navItems } from "@/components/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Divider } from "@/components/ui/divider";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

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
  // Provider lives here (not in AppShell) so the shell layout and the
  // mobile experience stay untouched. The wrapper carries AppShell's
  // responsive visibility; md:w-auto keeps it from claiming row width.
  return (
    <SidebarProvider className={cn("hidden w-auto md:flex", className)}>
      <SidebarShell userName={userName} userEmail={userEmail} plan={plan} />
    </SidebarProvider>
  );
}

function SidebarShell({
  userName,
  userEmail,
  plan,
}: {
  userName: string;
  userEmail: string;
  plan: PlanId;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
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
    <SidebarPrimitive collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between border-b border-border p-4">
        {collapsed ? (
          <p aria-hidden="true" className="text-lg font-semibold tracking-tight">
            p
          </p>
        ) : (
          <p className="text-lg font-semibold tracking-tight">postvia</p>
        )}
        <SidebarTrigger
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      asChild
                    >
                      <Link
                        href={item.href}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
      </SidebarContent>
      <SidebarFooter
        className={cn("border-t border-border", collapsed ? "p-3" : "p-4")}
      >
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
            onClick={() => void handleSignOut()}
            className="mt-3 w-full justify-start"
          >
            Sign out
          </Button>
        )}
        {!collapsed && (
          <>
            <Divider className="my-3" />
            <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
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
      </SidebarFooter>
      <SidebarRail />
    </SidebarPrimitive>
  );
}
