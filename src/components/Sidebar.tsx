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
      <SidebarHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3.5">
        {collapsed ? (
          <p aria-hidden="true" className="font-heading text-lg font-semibold tracking-tight">
            p
          </p>
        ) : (
          <p className="font-heading text-lg font-semibold tracking-tight">postvia</p>
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
          <div className="px-3 pt-1 pb-2">
            <Link
              href="/billing"
              className="block rounded-xl border border-border bg-fill1 p-3 outline-none transition-colors hover:bg-fill2 focus-visible:ring-2 focus-visible:ring-primary-focus"
            >
              <p className="flex items-center gap-1.5 text-sm leading-5 font-medium">
                <SparklesIcon className="size-4 shrink-0" aria-hidden="true" />
                Unlock more with Postvia
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                More posts, more accounts and Bulk scheduling.
              </p>
              <p className="mt-2 text-xs leading-4 font-medium text-primary-text underline underline-offset-4">
                View plans
              </p>
            </Link>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter
        className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}
      >
        <div className={cn("flex items-center gap-3 px-1", collapsed && "justify-center px-0")}>
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="min-w-0 flex-1 text-sm">
              <p className="truncate leading-5 font-medium">{userName}</p>
              <p className="truncate text-xs leading-4 text-muted-foreground">
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
            className="mt-2 w-full"
          >
            <LogOutIcon />
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => void handleSignOut()}
            className="mt-2 w-full justify-start font-normal"
          >
            <LogOutIcon data-icon="inline-start" />
            Sign out
          </Button>
        )}
        {!collapsed && (
          <>
            <Divider className="my-2.5" />
            <div className="flex items-center gap-2 px-2 text-xs leading-4 text-muted-foreground">
              <Link
                href="/terms"
                className="rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Terms
              </Link>
              <span aria-hidden="true">&middot;</span>
              <Link
                href="/privacy"
                className="rounded-sm transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
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
