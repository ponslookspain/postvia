import {
  CalendarIcon,
  ClapperboardIcon,
  FileTextIcon,
  LayoutGridIcon,
  PlusIcon,
  SettingsIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGridIcon },
  { href: "/posts", label: "Posts", icon: FileTextIcon },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/posts/new", label: "Create post", icon: PlusIcon },
  { href: "/posts/bulk", label: "Bulk video", icon: ClapperboardIcon },
  { href: "/accounts", label: "Accounts", icon: UsersIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  // /posts/new and /posts/bulk are separate entries; everything else
  // under /posts belongs to Posts.
  if (href === "/posts") {
    return (
      pathname.startsWith("/posts") &&
      pathname !== "/posts/new" &&
      pathname !== "/posts/bulk"
    );
  }
  return false;
}
