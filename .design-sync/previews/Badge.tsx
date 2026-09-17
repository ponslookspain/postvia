import { Badge, BadgeDot } from "postvia";

/**
 * Badge previews. Badge takes the PostVIA size pair
 * (`size="20" | "24"`, default "24") crossed with
 * `variant="strong" | "outline" | "soft"` and a semantic `color`
 * (`"primary" | "error" | "neutral"`, default "neutral"). The product uses a
 * narrow slice of that matrix: soft neutral for counts and metadata, outline
 * neutral for quiet labels, soft error for "Reconnect" / "Failed", strong
 * primary for plan markers. Post statuses ("Scheduled", "Published", …) go
 * through the StatusBadge domain gateway, never through a Badge color.
 *
 * Scaffolding is inline-styled so nothing depends on a utility class that was
 * never scanned into the stylesheet.
 */

const stage: React.CSSProperties = {
  width: 372,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

export function Variants() {
  return (
    <div style={stage}>
      <div style={row}>
        <Badge variant="strong">Strong</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="soft">Soft</Badge>
      </div>
      <span style={caption}>Neutral, the product default.</span>
      <div style={row}>
        <Badge variant="strong" color="primary">Strong</Badge>
        <Badge variant="outline" color="primary">Outline</Badge>
        <Badge variant="soft" color="primary">Soft</Badge>
      </div>
      <span style={caption}>Primary — PostVIA Blue, for plan markers.</span>
      <div style={row}>
        <Badge variant="strong" color="error">Strong</Badge>
        <Badge variant="outline" color="error">Outline</Badge>
        <Badge variant="soft" color="error">Reconnect</Badge>
      </div>
      <span style={caption}>Error — failure states only.</span>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={stage}>
      <div style={row}>
        <Badge size="20" variant="soft">20</Badge>
        <Badge size="24" variant="soft">24</Badge>
      </div>
      <span style={caption}>
        The PostVIA size pair. Default is 24 — Button&apos;s &quot;sm&quot;
        and &quot;lg&quot; would drop every size class here.
      </span>
    </div>
  );
}

export function WithDot() {
  return (
    <div style={stage}>
      <div style={row}>
        <Badge variant="outline">
          <BadgeDot />
          Draft
        </Badge>
        <Badge variant="soft" color="primary">
          <BadgeDot />
          Scheduled
        </Badge>
        <Badge variant="soft" color="error">
          <BadgeDot />
          Failed
        </Badge>
      </div>
      <span style={caption}>
        BadgeDot is the leading marker StatusBadge builds on.
      </span>
    </div>
  );
}

export function InContext() {
  return (
    <div style={stage}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
          Selected channels
        </span>
        <Badge variant="soft" style={{ fontVariantNumeric: "tabular-nums" }}>
          3 / 4
        </Badge>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
          @studionorth_x
        </span>
        <Badge variant="soft" color="error">
          Reconnect
        </Badge>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
          Caption length
        </span>
        <Badge variant="soft" style={{ fontVariantNumeric: "tabular-nums" }}>
          186 / 280
        </Badge>
      </div>
    </div>
  );
}
