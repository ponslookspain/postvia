import { Divider } from "postvia";

/**
 * Divider previews. Divider is a Radix Separator with one job: a `bg-soft-alpha`
 * hairline, full-width when horizontal and full-height when vertical. PostVIA
 * separates blocks by tone rather than by drawn boxes, so the divider only shows
 * up where two things genuinely share a surface — inside a composer card,
 * between settings rows, or between the meta items on a post row.
 *
 * A bare rule on an empty stage tells you nothing, so every cell puts it in the
 * layout it actually serves. Heights for the vertical case come from the flex
 * parent (`data-[orientation=vertical]:h-full` needs a stretched row).
 */

const stage: React.CSSProperties = {
  width: 340,
  display: "flex",
  flexDirection: "column",
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-fg-tertiary)",
};

export function SectionSplit() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 14 }}>
        <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>
          Caption
        </span>
        <span style={caption}>
          Shared across every selected channel unless you customise one.
        </span>
      </div>
      <Divider />
      <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 14 }}>
        <span style={{ fontSize: 15, lineHeight: "22px", fontWeight: 600 }}>
          Schedule
        </span>
        <span style={caption}>Tuesday 18 March, 09:00 — Europe/Madrid</span>
      </div>
    </div>
  );
}

export function ListRows() {
  const rows = [
    ["Email notifications", "On"],
    ["Weekly digest", "Mondays"],
    ["Failed post alerts", "On"],
    ["Marketing updates", "Off"],
  ];
  return (
    <div style={stage}>
      {rows.map(([label, value], i) => (
        <div key={label} style={{ display: "flex", flexDirection: "column" }}>
          {i > 0 && <Divider />}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "12px 0",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: "20px" }}>{label}</span>
            <span style={caption}>{value}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function VerticalMetaRow() {
  return (
    <div style={{ ...stage, gap: 10 }}>
      <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
        Behind the scenes of the studio reshoot
      </span>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 10,
          height: 16,
        }}
      >
        <span style={caption}>Instagram</span>
        <Divider orientation="vertical" />
        <span style={caption}>Tue 09:00</span>
        <Divider orientation="vertical" />
        <span style={caption}>2 assets</span>
      </div>
      <span style={caption}>
        Vertical dividers need a stretched flex parent with a height.
      </span>
    </div>
  );
}
