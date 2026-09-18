import {
  Avatar,
  AvatarBadge,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarIndicator,
  AvatarStatus,
  PlatformIcon,
} from "postvia";

/**
 * Avatar previews. A bare `<Avatar />` renders an empty circle — the component
 * is a sized, rounded frame and nothing else, so every cell here composes it
 * with the child that gives it content: initials, a platform glyph, a status
 * pip or an overflow count.
 *
 * Sizing uses the numeric scale
 * (`size="16|20|24|32|36|40|48|64|80|120"`, default "32"); Button's
 * `sm` / `lg` values would silently drop every size class.
 *
 * Two placement notes, both from reading the source rather than guessing:
 * `AvatarIndicator` and `AvatarStatus` are `absolute` with **no** offsets of
 * their own, so the caller positions them; and `AvatarBadge` sizes itself from
 * `group-data-[size=…]/avatar`, which needs an ancestor marked `group/avatar`
 * — no call site in `src/` sets that, so the badge is given an explicit size
 * here instead. The capture is offline, so no cell references a remote image.
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

export function Sizes() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        {(["24", "32", "40", "48", "64"] as const).map((size) => (
          <Avatar key={size} size={size}>
            <AvatarFallback>ST</AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span style={caption}>
        24 · 32 (default) · 40 · 48 · 64. The initials fallback is the only
        thing PostVIA ever puts in a user avatar.
      </span>
    </div>
  );
}

export function FallbackColors() {
  const people: Array<
    [string, "light-blue" | "emerald" | "amber" | "red"]
  > = [
    ["ST", "light-blue"],
    ["MR", "emerald"],
    ["AK", "amber"],
    ["JD", "red"],
  ];
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {people.map(([initials, color]) => (
          <Avatar key={initials} size="40">
            <AvatarFallback color={color}>{initials}</AvatarFallback>
          </Avatar>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar size="64">
          <AvatarFallback color="light-blue">ST</AvatarFallback>
        </Avatar>
        <Avatar size="64" rounded="square">
          <AvatarFallback color="light-blue">ST</AvatarFallback>
        </Avatar>
        <span style={caption}>
          circle (default) · square. The radius scale is generous, so the two
          only separate above 48px.
        </span>
      </div>
      <span style={caption}>
        Tinted fallbacks. With no color prop the fallback is muted monochrome.
      </span>
    </div>
  );
}

export function ChannelAvatars() {
  const rows: Array<[string, string]> = [
    ["INSTAGRAM", "Instagram"],
    ["THREADS", "Threads"],
    ["TIKTOK", "TikTok"],
    ["X", "X (Twitter)"],
  ];
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {rows.map(([platform, label]) => (
          <Avatar key={platform} size="40">
            <AvatarFallback aria-label={label}>
              <PlatformIcon platform={platform} className="size-5" />
            </AvatarFallback>
          </Avatar>
        ))}
      </div>
      <span style={caption}>
        The channel strip in the composer: one avatar frame per connected
        account, brand glyph inside the fallback.
      </span>
    </div>
  );
}

export function WithStatus() {
  const items: Array<{
    initials: string;
    variant: "online" | "busy" | "away" | "offline";
    label: string;
  }> = [
    { initials: "ST", variant: "online", label: "Connected" },
    { initials: "MR", variant: "busy", label: "Publishing" },
    { initials: "AK", variant: "away", label: "Queued" },
    { initials: "JD", variant: "offline", label: "Expired" },
  ];
  return (
    <div style={stage}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 18 }}>
        {items.map((item) => (
          <div
            key={item.initials}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              width: 60,
            }}
          >
            <Avatar size="48">
              <AvatarFallback>{item.initials}</AvatarFallback>
              <AvatarIndicator style={{ right: 5, bottom: 5 }}>
                <AvatarStatus variant={item.variant} />
              </AvatarIndicator>
            </Avatar>
            <span style={{ ...caption, textAlign: "center" }}>{item.label}</span>
          </div>
        ))}
      </div>
      <span style={caption}>
        AvatarIndicator is the positioner; AvatarStatus carries the hue.
      </span>
    </div>
  );
}

export function GroupAndBadge() {
  return (
    <div style={stage}>
      <AvatarGroup>
        {["INSTAGRAM", "THREADS", "TIKTOK", "X"].map((platform) => (
          <Avatar key={platform} size="32">
            <AvatarFallback>
              <PlatformIcon platform={platform} className="size-4" />
            </AvatarFallback>
          </Avatar>
        ))}
        <AvatarGroupCount>+2</AvatarGroupCount>
      </AvatarGroup>
      <span style={caption}>
        The channel stack on a post row: AvatarGroup overlaps its children and
        rings them against the surface, AvatarGroupCount closes it. Keep the
        children at 32px — AvatarGroupCount is fixed at 32 and does not follow
        the numeric size scale.
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Avatar size="40">
          <AvatarFallback aria-label="Instagram">
            <PlatformIcon platform="INSTAGRAM" className="size-5" />
          </AvatarFallback>
          <AvatarBadge
            aria-hidden="true"
            style={{ width: 12, height: 12 }}
          />
        </Avatar>
        <span style={caption}>
          AvatarBadge marks a channel whose caption has been customised.
        </span>
      </div>
    </div>
  );
}
