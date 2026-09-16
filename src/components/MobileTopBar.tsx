"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/components/ui/toast";
import { accountMenuItems, isActivePath, navItems } from "@/components/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function MobileTopBar({
  userName,
  userEmail,
}: {
  userName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
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
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            <MenuIcon />
          </Button>
          <p className="font-heading text-base font-semibold tracking-tight">postvia</p>
        </div>
        <Popover>
          <PopoverTrigger asChild aria-label="Account menu">
            <button
              type="button"
              className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Avatar>
                <AvatarFallback>{initial}</AvatarFallback>
              </Avatar>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {userEmail}
            </p>
            <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3">
              {accountMenuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
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

      <Drawer open={menuOpen} onOpenChange={setMenuOpen} direction="left">
        <DrawerContent className="w-3/4 sm:max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Menu</DrawerTitle>
            <DrawerDescription>
              Go to a section of Postvia.
            </DrawerDescription>
          </DrawerHeader>
          <nav aria-label="Primary" className="flex flex-col gap-1 px-6">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
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
          <div className="flex items-center gap-2 border-t border-border px-6 pt-3 pb-6 text-xs text-muted-foreground">
            <Link
              href="/terms"
              onClick={() => setMenuOpen(false)}
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <span aria-hidden="true">&middot;</span>
            <Link
              href="/privacy"
              onClick={() => setMenuOpen(false)}
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
          </div>
          <DrawerClose>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-4 right-4"
              aria-label="Close menu"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </DrawerClose>
        </DrawerContent>
      </Drawer>
    </header>
  );
}
