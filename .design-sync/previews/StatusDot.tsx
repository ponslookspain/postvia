import { StatusDot } from "postvia";

/**
 * StatusDot previews. The dot is the smallest unit of PostVIA's status
 * language — an 8px disc that carries the hue while the surrounding text
 * carries the meaning. It appears bare in calendar chips and account rows,
 * and inside StatusBadge in lists and headers.
 *
 * PUBLISHING is the only animated state (`animate-pulse`); a still capture
 * catches it at an arbitrary opacity, which is expected.
 */

const stage: React.CSSProperties = {
  width: 320,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

const STATUSES: Array<[string, string]> = [
  ["DRAFT", "Draft"],
  ["SCHEDULED", "Scheduled"],
  ["PUBLISHING", "Publishing"],
  ["PUBLISHED", "Published"],
  ["PARTIALLY_PUBLISHED", "Partially published"],
  ["FAILED", "Failed"],
];

export function Legend() {
  return (
    <div style={stage}>
      {STATUSES.map(([status, label]) => (
        <div key={status} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot status={status} />
          <span style={{ fontSize: 14, lineHeight: "20px" }}>{label}</span>
        </div>
      ))}
      <span style={caption}>
        The calendar filter legend — each hue is used nowhere else on the page.
      </span>
    </div>
  );
}

export function CalendarChips() {
  const chips = [
    { time: "09:00", text: "Behind the scenes reshoot", status: "SCHEDULED" },
    { time: "12:30", text: "Three things we shipped", status: "PUBLISHED" },
    { time: "17:45", text: "Launch teaser cut #2", status: "FAILED" },
  ];
  return (
    <div style={{ ...stage, gap: 6 }}>
      <span style={{ ...caption, fontWeight: 600 }}>Thursday 18</span>
      {chips.map((chip) => (
        <div
          key={chip.time}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 8,
            background: "var(--color-accent, rgba(0,0,0,0.04))",
            minWidth: 0,
          }}
        >
          <StatusDot status={chip.status} />
          <span style={{ fontSize: 12, lineHeight: "16px", fontVariantNumeric: "tabular-nums" }}>
            {chip.time}
          </span>
          <span
            style={{
              fontSize: 12,
              lineHeight: "16px",
              color: "var(--color-muted-foreground)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {chip.text}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ChannelHealth() {
  const rows = [
    { name: "@studionorth", note: "Connected", status: "PUBLISHED" },
    { name: "@studionorth.tt", note: "Publishing now", status: "PUBLISHING" },
    { name: "@studionorth_x", note: "Reconnect required", status: "FAILED" },
  ];
  return (
    <div style={stage}>
      {rows.map((row) => (
        <div key={row.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <StatusDot status={row.status} />
          <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
            {row.name}
          </span>
          <span style={{ ...caption, marginLeft: "auto" }}>{row.note}</span>
        </div>
      ))}
    </div>
  );
}
