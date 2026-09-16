import { Avatar, AvatarFallback, PlatformIcon } from "postvia";

/**
 * PlatformIcon previews. Four fill-based brand marks — X, Threads, TikTok,
 * Instagram — drawn on one shared 24px grid so they read at the same optical
 * size, plus a GENERIC disc for anything unrecognised. Never substitute a
 * Lucide icon for a brand mark.
 *
 * The component's own default box is 16px (`size-4`), which is correct inside
 * a row but reads as nothing on an empty stage, so the gallery cell steps up
 * to `size-8`. `className` is the only sizing lever the component exposes —
 * it takes no `style` prop — so these are the few utility classes in this
 * batch; all of them already exist in `src/`. Colour comes from
 * `currentColor`, which is why the glyphs inherit whatever text tone the row
 * around them uses.
 */

const stage: React.CSSProperties = {
  width: 340,
  display: "flex",
  flexDirection: "column",
  gap: 14,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

const PLATFORMS: Array<[string, string]> = [
  ["INSTAGRAM", "Instagram"],
  ["THREADS", "Threads"],
  ["TIKTOK", "TikTok"],
  ["X", "X"],
  ["GENERIC", "Generic"],
];

export function AllPlatforms() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        {PLATFORMS.map(([platform, label]) => (
          <div
            key={platform}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              width: 56,
            }}
          >
            <PlatformIcon platform={platform} className="size-8" />
            <span style={{ ...caption, textAlign: "center" }}>{label}</span>
          </div>
        ))}
      </div>
      <span style={caption}>
        One 24px grid, one optical weight. GENERIC is the fallback for an
        unknown platform — never another brand&apos;s mark.
      </span>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <PlatformIcon platform="INSTAGRAM" className="size-4" />
        <PlatformIcon platform="INSTAGRAM" className="size-5" />
        <PlatformIcon platform="INSTAGRAM" className="size-6" />
        <PlatformIcon platform="INSTAGRAM" className="size-8" />
      </div>
      <span style={caption}>
        16px is the default and the list-row size; 20–24px for account cards,
        32px for empty states.
      </span>
    </div>
  );
}

export function ChannelRows() {
  const rows = [
    { platform: "INSTAGRAM", name: "Instagram", handle: "@studionorth · last post 2h ago" },
    { platform: "THREADS", name: "Threads", handle: "@studionorth · 14 sent" },
    { platform: "TIKTOK", name: "TikTok", handle: "@studionorth.tt · nothing sent yet" },
    { platform: "X", name: "X (Twitter)", handle: "@studionorth_x · 41 sent" },
  ];
  return (
    <div style={{ ...stage, gap: 4 }}>
      {rows.map((row) => (
        <div
          key={row.platform}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}
        >
          <Avatar size="36">
            <AvatarFallback aria-label={row.name}>
              <PlatformIcon platform={row.platform} className="size-4" />
            </AvatarFallback>
          </Avatar>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
              {row.name}
            </span>
            <span
              style={{
                ...caption,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.handle}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TargetStrip() {
  return (
    <div style={stage}>
      <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
        Behind the scenes of the studio reshoot
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <PlatformIcon platform="INSTAGRAM" className="size-4" />
        <PlatformIcon platform="THREADS" className="size-4" />
        <PlatformIcon platform="TIKTOK" className="size-4" />
        <span style={{ ...caption, marginLeft: 4 }}>3 channels · Tue 09:00</span>
      </div>
    </div>
  );
}
