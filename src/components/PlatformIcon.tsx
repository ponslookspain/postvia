import { cn } from "cn";

/**
 * Brand glyphs for connected social platforms (custom SVG: no Lucide
 * equivalents exist). Sized via className; parents may also size them with
 * `[&_svg]` selectors.
 */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: string;
  className?: string;
}) {
  if (platform === "THREADS") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className={cn("size-5", className)}
      >
        <circle cx="12" cy="12" r="8.5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="15" cy="9" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "TIKTOK") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={cn("size-5", className)}
      >
        <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 1 1 .77-5.05v-3.15a5.74 5.74 0 0 0-.77-.05A5.72 5.72 0 1 0 15.54 15V8.5a7.27 7.27 0 0 0 4.28 1.38V6.79a4.3 4.3 0 0 1-3.22-.97Z" />
      </svg>
    );
  }
  if (platform === "INSTAGRAM") {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        className={cn("size-5", className)}
      >
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("size-5", className)}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
