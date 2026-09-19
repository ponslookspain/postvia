import { Progress } from "postvia";

/**
 * Progress previews. Progress is a 6px track (`bg-muted`) with a
 * `bg-primary` indicator — the only place the brand hue appears outside a
 * primary action. The plan-usage cell is the dashboard's own composition
 * (`src/app/dashboard/page.tsx`): a sentence on the left, a short bar on
 * the right. The indicator is animated by a transform transition, so every
 * cell is given a fixed `value` and reads correctly as a still frame.
 */

const stage: React.CSSProperties = {
  width: 400,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const caption: React.CSSProperties = {
  fontSize: 14,
  lineHeight: "20px",
  color: "var(--muted-foreground)",
};

export function PlanUsage() {
  return (
    <div style={stage}>
      <p style={{ fontSize: 14, lineHeight: "20px", margin: 0 }}>
        <span style={{ fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
          14
        </span>{" "}
        of 20 posts this month
        <span style={caption}> · resets 1 October</span>
      </p>
      <Progress
        value={70}
        aria-label="Posts used this month: 14 of 20"
        style={{ width: 160 }}
      />
    </div>
  );
}

export function Uploading() {
  return (
    <div style={stage}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
          launch-teaser.mp4
        </span>
        <span style={{ ...caption, fontVariantNumeric: "tabular-nums" }}>
          42%
        </span>
      </div>
      <Progress value={42} aria-label="Uploading launch-teaser.mp4" />
      <p style={{ ...caption, margin: 0 }}>
        Uploading — about 20 seconds left.
      </p>
    </div>
  );
}

export function Scale() {
  return (
    <div style={{ ...stage, gap: 16 }}>
      {[
        ["Just started", 8],
        ["Halfway", 50],
        ["Nearly there", 92],
        ["Done", 100],
      ].map(([label, value]) => (
        <div
          key={label as string}
          style={{ display: "flex", flexDirection: "column", gap: 6 }}
        >
          <span style={caption}>{label}</span>
          <Progress value={value as number} aria-label={label as string} />
        </div>
      ))}
    </div>
  );
}

export function Thick() {
  return (
    <div style={stage}>
      <span style={caption}>
        A taller track, sized by the caller — the height is not a variant.
      </span>
      <Progress
        value={64}
        aria-label="Monthly publishing goal"
        style={{ height: 10 }}
      />
    </div>
  );
}
