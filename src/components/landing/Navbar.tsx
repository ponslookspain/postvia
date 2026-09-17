"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, ChevronDownIcon, MenuIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
  CREATE_FEATURES,
  PLAN_PUBLISH_FEATURES,
  PLATFORM_LINKS,
} from "@/components/marketing/marketing-data";
import { PlatformIcon } from "@/components/PlatformIcon";

function MegaMenuPanel({ onNavigate }: { onNavigate: () => void }) {
  const ComposerIcon = CREATE_FEATURES[1]!.icon;
  const CustomizeIcon = CREATE_FEATURES[2]!.icon;
  return (
    <div className="absolute top-full left-1/2 z-50 w-[min(92vw,46rem)] -translate-x-1/2 pt-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
        <div className="grid gap-6 p-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Plan and publish</p>
            <ul className="mt-3 flex flex-col gap-1">
              {PLAN_PUBLISH_FEATURES.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="group flex items-start gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <item.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium group-hover:text-foreground">
                        {item.title}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Create</p>
            <ul className="mt-3 flex flex-col gap-1">
              {CREATE_FEATURES.slice(0, 1).map((item) => (
                <li key={item.title}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className="group flex items-start gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <item.icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium group-hover:text-foreground">
                        {item.title}
                      </span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  href="/cross-platform-publishing"
                  onClick={onNavigate}
                  className="group flex items-start gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <ComposerIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium group-hover:text-foreground">
                      Multi-Platform Composer
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      One caption with shared text and media attachment.
                    </span>
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  href="/platform-previews"
                  onClick={onNavigate}
                  className="group flex items-start gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <CustomizeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-sm font-medium group-hover:text-foreground">
                      Per-Platform Customization
                    </span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      Overrides, TikTok titles and limits per account.
                    </span>
                  </span>
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Platforms</p>
            <ul className="mt-3 flex flex-col gap-1">
              {PLATFORM_LINKS.map((platform) => (
                <li key={platform.href}>
                  <Link
                    href={platform.href}
                    onClick={onNavigate}
                    className="group flex items-center gap-2.5 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <PlatformIcon platform={platform.platform} />
                    <span className="text-sm font-medium group-hover:text-foreground">
                      {platform.title}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-6 py-3">
          <p className="text-xs text-muted-foreground">
            Every capability links to a real page.
          </p>
          <Link
            href="/features"
            onClick={onNavigate}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            View all features
            <ArrowRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Navbar({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [mobileFeaturesOpen, setMobileFeaturesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const featuresWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close the mega menu on Escape or pointer-down outside while open.
  // Route changes close it via onNavigate on every mega-menu link.
  useEffect(() => {
    if (!featuresOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFeaturesOpen(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        featuresWrapRef.current &&
        !featuresWrapRef.current.contains(event.target as Node)
      ) {
        setFeaturesOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [featuresOpen]);

  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFeaturesOpen(false), 120);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  function closeAll() {
    setFeaturesOpen(false);
    setOpen(false);
  }

  return (
    <header
      className={cn(
        "sticky top-0 z-50 bg-background/85 backdrop-blur-md transition-[border-color,box-shadow] duration-300 motion-reduce:transition-none",
        scrolled
          ? "border-b border-border"
          : "border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-8">
        <Link
          href="/"
          className="rounded-sm font-heading text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          postvia
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          <Link
            href="/#product"
            className="rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Product
          </Link>
          <div
            ref={featuresWrapRef}
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setFeaturesOpen(true);
            }}
            onMouseLeave={scheduleClose}
          >
            <button
              type="button"
              aria-expanded={featuresOpen}
              aria-haspopup="true"
              onClick={() => setFeaturesOpen((value) => !value)}
              className="flex items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Features
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-3.5 transition-transform duration-200 motion-reduce:transition-none",
                  featuresOpen && "rotate-180"
                )}
              />
            </button>
            {featuresOpen && <MegaMenuPanel onNavigate={closeAll} />}
          </div>
          <Link
            href="/pricing"
            className="rounded-sm text-sm text-muted-foreground outline-none transition-colors duration-200 hover:text-foreground motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Pricing
          </Link>
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          {isLoggedIn ? (
            <Button nativeButton={false} render={<Link href="/dashboard" />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
              <Button nativeButton={false} render={<Link href="/signup" />}>
                Get started
              </Button>
            </>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-haspopup="dialog"
          className="md:hidden"
        >
          <MenuIcon aria-hidden="true" />
        </Button>
      </div>
      <Drawer open={open} onOpenChange={setOpen} direction="right">
        <DrawerContent className="w-3/4 overflow-y-auto sm:max-w-sm">
          <DrawerHeader>
            <DrawerTitle>Menu</DrawerTitle>
            <DrawerDescription>Go to a section of Postvia.</DrawerDescription>
          </DrawerHeader>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-6">
            <Link
              href="/#product"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Product
            </Link>
            <button
              type="button"
              aria-expanded={mobileFeaturesOpen}
              onClick={() => setMobileFeaturesOpen((value) => !value)}
              className="flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Features
              <ChevronDownIcon
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-200 motion-reduce:transition-none",
                  mobileFeaturesOpen && "rotate-180"
                )}
              />
            </button>
            {mobileFeaturesOpen && (
              <div className="flex flex-col gap-4 rounded-md bg-muted/40 px-3 py-3">
                <div>
                  <p className="px-1 text-xs font-medium text-muted-foreground">
                    Plan and publish
                  </p>
                  {PLAN_PUBLISH_FEATURES.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {item.title}
                    </Link>
                  ))}
                </div>
                <div>
                  <p className="px-1 text-xs font-medium text-muted-foreground">Create</p>
                  <Link
                    href="/platform-previews"
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Platform Previews
                  </Link>
                  <Link
                    href="/cross-platform-publishing"
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Multi-Platform Composer
                  </Link>
                  <Link
                    href="/platform-previews"
                    onClick={() => setOpen(false)}
                    className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    Per-Platform Customization
                  </Link>
                </div>
                <div>
                  <p className="px-1 text-xs font-medium text-muted-foreground">Platforms</p>
                  {PLATFORM_LINKS.map((platform) => (
                    <Link
                      key={platform.href}
                      href={platform.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {platform.title}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/features"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-primary"
                >
                  View all features
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                </Link>
              </div>
            )}
            <Link
              href="/pricing"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/#faq"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              FAQ
            </Link>
          </nav>
          <div className="flex flex-col gap-2 border-t border-border px-6 pt-4 pb-6">
            {isLoggedIn ? (
              <Button nativeButton={false} render={<Link href="/dashboard" />}>
                Dashboard
              </Button>
            ) : (
              <>
                <Button nativeButton={false} render={<Link href="/signup" />}>
                  Get started
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/login" />}
                >
                  Sign in
                </Button>
              </>
            )}
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
