import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Section,
  SectionHeader,
  StatusBadge,
  StatusDot,
} from "postvia";

/**
 * Section previews. A section is a labelled band of a page, separated
 * from its neighbours by tone and spacing rather than by a box. Card is
 * reached for only when the controls inside act together — the dashboard
 * does exactly that for "Recent posts", so both compositions are shown.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-fg-tertiary)",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 0",
  borderTop: "1px solid var(--border)",
  fontSize: 14,
};

export function RuleSeparatedRows() {
  return (
    <Section labelledBy="sec-upnext">
      <SectionHeader
        id="sec-upnext"
        title="Up next"
        description="The next posts due to go out, in the order they'll publish."
        actions={
          <Button variant="ghost" size="sm">
            View all scheduled
          </Button>
        }
      />
      <div style={rowStyle}>
        <span style={{ flex: 1, minWidth: 0 }}>Spring launch teaser</span>
        <span style={{ fontSize: 13, color: "var(--color-fg-tertiary)" }}>
          tomorrow at 09:00
        </span>
        <StatusBadge status="SCHEDULED" />
      </div>
      <div style={rowStyle}>
        <span style={{ flex: 1, minWidth: 0 }}>Behind the scenes clip</span>
        <span style={{ fontSize: 13, color: "var(--color-fg-tertiary)" }}>
          Saturday at 14:00
        </span>
        <StatusBadge status="SCHEDULED" />
      </div>
      <div style={rowStyle}>
        <span style={{ flex: 1, minWidth: 0 }}>Hiring post — designer</span>
        <span style={{ fontSize: 13, color: "var(--color-fg-tertiary)" }}>
          in 2 weeks
        </span>
        <StatusBadge status="DRAFT" />
      </div>
    </Section>
  );
}

export function SectionInCard() {
  return (
    <div>
      <p style={caption}>
        Card is the exception, not the default: the dashboard groups
        &quot;Recent posts&quot; in one because the filter and the list act
        together.
      </p>
      <Section labelledBy="sec-recent">
        <Card size="sm">
          <CardHeader>
            <CardTitle id="sec-recent">Recent posts</CardTitle>
            <CardDescription>
              Everything that went out in the last week
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm">
                View all
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div style={rowStyle}>
              <span style={{ flex: 1, minWidth: 0 }}>
                Customer story: Vela Studio
              </span>
              <StatusBadge status="PUBLISHED" />
            </div>
            <div style={rowStyle}>
              <span style={{ flex: 1, minWidth: 0 }}>Weekly roundup</span>
              <StatusBadge status="FAILED" />
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}

export function LabelledSection() {
  return (
    <div>
      <p style={caption}>
        A section with no visible heading still names itself for assistive
        tech via <code>label</code>; the legend carries the meaning visually.
      </p>
      <Section label="Publishing status legend">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            padding: "12px 0",
            borderTop: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--color-fg-tertiary)",
          }}
        >
          {[
            ["Draft", "DRAFT"],
            ["Scheduled", "SCHEDULED"],
            ["Published", "PUBLISHED"],
            ["Failed", "FAILED"],
          ].map(([label, status]) => (
            <span
              key={status}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <StatusDot status={status} />
              {label}
            </span>
          ))}
          <Badge variant="outline" style={{ marginLeft: "auto" }}>
            12 posts
          </Badge>
        </div>
      </Section>
    </div>
  );
}
