import { StatusBadge } from "postvia";

/**
 * StatusBadge previews. This is PostVIA's post-status language: one dot plus
 * one label, shared by the posts list, the calendar chips and the post detail
 * header, so a status reads the same at every size.
 *
 * The shell stays quiet — neutral outline or soft fill — and the hue lives in
 * the dot. SCHEDULED is info blue on purpose: the brand hue and the error hue
 * are both red, so a routine future-dated post must not borrow either.
 *
 * Scaffolding is inline-styled; StatusBadge is driven only by its `status`
 * prop, which is the whole API.
 */

const stage: React.CSSProperties = {
  width: 340,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const caption: React.CSSProperties = {
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

const STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "PARTIALLY_PUBLISHED",
  "FAILED",
];

export function AllStatuses() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>
      <span style={caption}>
        The six post statuses. Scheduled uses info blue, never the crimson
        brand hue.
      </span>
    </div>
  );
}

export function PostRows() {
  const rows = [
    { title: "Behind the scenes of the studio reshoot", meta: "Instagram, Threads · Tue 9:00", status: "SCHEDULED" },
    { title: "Three things we shipped this month", meta: "X · Published 2h ago", status: "PUBLISHED" },
    { title: "Untitled draft", meta: "No channels yet", status: "DRAFT" },
    { title: "Launch teaser cut #2", meta: "TikTok · Token expired", status: "FAILED" },
  ];
  return (
    <div style={stage}>
      {rows.map((row) => (
        <div
          key={row.title}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
            <span
              style={{
                fontSize: 14,
                lineHeight: "20px",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {row.title}
            </span>
            <span style={caption}>{row.meta}</span>
          </div>
          <StatusBadge status={row.status} />
        </div>
      ))}
    </div>
  );
}

export function DetailHeader() {
  return (
    <div style={{ ...stage, gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 18, lineHeight: "24px", fontWeight: 600 }}>
          Spring capsule reveal
        </span>
        <StatusBadge status="PARTIALLY_PUBLISHED" />
      </div>
      <span style={caption}>
        Published to Instagram and Threads · TikTok still retrying
      </span>
    </div>
  );
}
