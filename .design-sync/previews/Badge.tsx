import { Badge, BadgeDot } from "postvia";

/**
 * Badge previews. Badge takes the Radian numeric scale
 * (`size="20" | "24" | "28"`, default "24") crossed with
 * `variant="strong" | "outline" | "soft"` and a `color`. The product uses a
 * narrow slice of that matrix: soft neutral for counts and metadata, outline
 * neutral for quiet labels, soft error for "Reconnect" / "Failed".
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
      <span style={caption}>Primary — the crimson brand hue.</span>
    </div>
  );
}

export function SemanticColors() {
  return (
    <div style={stage}>
      <div style={row}>
        <Badge variant="soft" color="info">Scheduled</Badge>
        <Badge variant="soft" color="success">Published</Badge>
        <Badge variant="soft" color="warning">Retrying</Badge>
        <Badge variant="soft" color="error">Reconnect</Badge>
      </div>
      <div style={row}>
        <Badge variant="outline" color="info">Scheduled</Badge>
        <Badge variant="outline" color="success">Published</Badge>
        <Badge variant="outline" color="warning">Retrying</Badge>
        <Badge variant="outline" color="error">Reconnect</Badge>
      </div>
      <span style={caption}>
        Soft above, outline below. Status hues live in badges and dots only.
      </span>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={stage}>
      <div style={row}>
        <Badge size="20" variant="soft">20</Badge>
        <Badge size="24" variant="soft">24</Badge>
        <Badge size="28" variant="soft">28</Badge>
      </div>
      <span style={caption}>
        The Radian numeric scale. Default is 24 — Button&apos;s &quot;sm&quot;
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
        <Badge variant="soft" color="info">
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
