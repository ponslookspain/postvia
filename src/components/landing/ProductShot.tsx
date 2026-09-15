import Image from "next/image";
import { cn } from "cn";

/**
 * Real product screenshot slot.
 *
 * Interim crops live in `public/landing/*.svg` so the layout, sizing,
 * and alt text are final. Replace each file with a pixel capture of the
 * named app screen (same filename, PNG preferred) — no code change needed.
 *
 * Required captures (desktop, light mode, 1440px):
 * - composer: /posts/new — global caption + per-platform previews visible
 * - accounts: /accounts — four connected-platform rows
 * - calendar: /calendar — month grid with scheduled chips
 */
export function ProductShot({
  src,
  alt,
  className,
  priority = false,
}: {
  src: "/landing/composer.svg" | "/landing/accounts.svg" | "/landing/calendar.svg";
  alt: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={800}
        sizes="(max-width: 768px) 100vw, 896px"
        priority={priority}
        className="h-auto w-full"
      />
    </div>
  );
}
