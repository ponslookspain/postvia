"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MenuIcon } from "lucide-react";
import { cn } from "cn";
import { authClient } from "@/lib/auth-client";
import { isActivePath, navItems } from "@/components/nav-items";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background md:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
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
          <p className="text-base font-semibold tracking-tight">postvia</p>
        </div>
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

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Menu</DialogTitle>
            <DialogDescription>
              Go to a section of Postvia.
            </DialogDescription>
          </DialogHeader>
          <nav aria-label="Primary" className="flex flex-col gap-1">
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
          <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
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
        </DialogContent>
      </Dialog>
    </header>
  );
}
