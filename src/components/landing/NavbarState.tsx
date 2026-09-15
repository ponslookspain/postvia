"use client";

import { authClient } from "@/lib/auth-client";
import { Navbar } from "@/components/landing/Navbar";

/**
 * Client-side session island for the static landing page.
 * SSR renders the logged-out navbar (SEO-safe default); after mount,
 * better-auth resolves the session from cookies and swaps in the
 * Dashboard CTA when signed in. The page itself stays statically
 * renderable — no `headers()`/`cookies()` in the server tree.
 */
export function NavbarState() {
  const { data } = authClient.useSession();
  return <Navbar isLoggedIn={data?.user != null} />;
}
