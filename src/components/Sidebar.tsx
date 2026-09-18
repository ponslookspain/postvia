"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MoonIcon,
  SparklesIcon,
  SunIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { useTheme } from "@/hooks/use-theme";
import type { PlanId } from "@/lib/plans";
import { accountMenuItems, isActivePath, navItems } from "@/components/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuDivider,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

export function Sidebar({
  userName,
  userEmail,
  plan,
}: {
  userName: string;
  userEmail: string;
  plan: PlanId;
}) {
  // Sidebar structure:
  // SidebarProvider lives in AppShell and wraps both this Sidebar and
  // SidebarInset as direct children. The rail is `variant="floating"`:
  // a separate surface on the bg-background canvas with an 8px inset,
  // so SidebarInset stays plain canvas (its inset card styles only
  // resolve for `variant="inset"`). No visibility classes here — the
  // primitive hides itself on mobile (hidden md:block / hidden md:flex
  // + Drawer branch) and sizes via its own --sidebar-width gap.
  const pathname = usePathname();
  const router = useRouter();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const initial = userName.trim().charAt(0).toUpperCase() || "U";
  const { theme, setTheme } = useTheme();

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
    <SidebarPrimitive variant="floating" collapsible="icon" theme="gray">
      <SidebarHeader
        className={cn(
          "flex-row items-center border-b border-border py-3.5",
          collapsed ? "justify-center px-1.5" : "justify-between gap-2 px-4"
        )}
      >
        {!collapsed && (
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
            <SidebarMenu className="gap-1">
              {navItems.map((item) => {
                const isActive = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      className="rounded-full"
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
              className="block rounded-xl bg-background p-3 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <p className="flex items-center gap-1.5 text-sm leading-5 font-medium">
                <SparklesIcon className="size-4 shrink-0" aria-hidden="true" />
                Unlock more with Postvia
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                More posts, more accounts and Bulk scheduling.
              </p>
              <p className="mt-2 text-xs leading-4 font-medium text-primary underline underline-offset-4">
                View plans
              </p>
            </Link>
          </div>
        )}
      </SidebarContent>
      <SidebarFooter
        className={cn("border-t border-border", collapsed ? "p-2" : "p-3")}
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Account menu"
            className={cn(
              "flex w-full items-center rounded-lg outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring",
              collapsed ? "justify-center p-1" : "gap-2.5 px-1.5 py-1.5"
            )}
          >
            <Avatar>
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left text-sm">
                  <p className="truncate leading-5 font-medium">{userName}</p>
                  <p className="truncate text-xs leading-4 text-muted-foreground">
                    {userEmail}
                  </p>
                </div>
                <ChevronsUpDownIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-56">
            <div className="flex items-center gap-2.5 px-2 py-1.5">
              <Avatar>
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm">
                <p className="truncate leading-5 font-medium">{userName}</p>
                <p className="truncate text-xs leading-4 text-muted-foreground">
                  {userEmail}
                </p>
              </div>
            </div>
            <DropdownMenuDivider />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {theme === "dark" ? (
                  <MoonIcon aria-hidden="true" />
                ) : (
                  <SunIcon aria-hidden="true" />
                )}
                Appearance
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as "light" | "dark")}
                >
                  <DropdownMenuRadioItem value="light">
                    <SunIcon aria-hidden="true" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">
                    <MoonIcon aria-hidden="true" />
                    Dark
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuDivider />
            {accountMenuItems.map((item) => {
              const Icon = item.icon;
              return (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>
                    <Icon aria-hidden="true" />
                    {item.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuDivider />
            <DropdownMenuItem asChild>
              <Link href="/terms">Terms of Service</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/privacy">Privacy Policy</Link>
            </DropdownMenuItem>
            <DropdownMenuDivider />
            <DropdownMenuItem
              onSelect={() => void handleSignOut()}
              className="text-error [&_svg]:text-error"
            >
              <LogOutIcon aria-hidden="true" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </SidebarPrimitive>
  );
}
