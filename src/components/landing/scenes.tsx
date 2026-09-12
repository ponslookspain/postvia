import { cn } from "cn";
import { PlatformIcon } from "@/components/PlatformIcon";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

/** Small platform row used across product scenes. */
export function ScenePlatforms({ platforms }: { platforms: string[] }) {
  return (
    <span className="flex items-center gap-1.5">
      {platforms.map((platform) => (
        <span
          key={platform}
          title={platform}
          className="flex size-5 items-center justify-center rounded-full bg-muted [&_svg]:size-3.5"
        >
          <PlatformIcon platform={platform} className="size-3.5" />
          <span className="sr-only">{platform}</span>
        </span>
      ))}
    </span>
  );
}

export function SceneStatusDot({ tone }: { tone: "ok" | "busy" | "bad" | "idle" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "ok" && "bg-emerald-600",
        tone === "busy" && "animate-pulse bg-blue-700",
        tone === "bad" && "bg-destructive",
        tone === "idle" && "bg-muted-foreground"
      )}
    />
  );
}

/** Fake caption block with realistic line lengths. */
export function SceneCaption({ lines = 3 }: { lines?: number }) {
  const widths = ["w-full", "w-11/12", "w-3/4", "w-2/3"];
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5">
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          className={cn("h-2 rounded-full bg-foreground/80", widths[i % widths.length])}
        />
      ))}
    </div>
  );
}

/** Fake media thumb: gradient-free solid with a play glyph for video. */
export function SceneThumb({
  kind,
  className,
}: {
  kind: "image" | "video";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md",
        kind === "image" ? "bg-blue-700/15" : "bg-amber-500/20",
        className ?? "size-12"
      )}
    >
      {kind === "video" ? (
        <svg viewBox="0 0 24 24" className="size-5 fill-foreground/60" aria-hidden="true">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-5 text-foreground/40" aria-hidden="true">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.5" />
          <path d="m5 18 5-5 3 3 3-3 3 3" />
        </svg>
      )}
    </span>
  );
}

export function SceneProgress({ value }: { value: number }) {
  return <Progress value={value} aria-hidden="true" />;
}

export function SceneBadge({ children }: { children: React.ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}
