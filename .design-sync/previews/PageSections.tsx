import {
  Button,
  PageSections,
  Section,
  SectionHeader,
  StatusBadge,
} from "postvia";

/**
 * PageSections previews. It is the one stacker every page uses, so the
 * only thing worth showing is the rhythm: a 2.5rem (--section-gap) gap
 * between major sections, with nothing drawn between them — separation
 * is tone and spacing, per the Surfaces rules.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
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

function Row({ title, when, status }: { title: string; when: string; status: string }) {
  return (
    <div style={rowStyle}>
      <span style={{ minWidth: 0, flex: 1 }}>{title}</span>
      <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>
        {when}
      </span>
      <StatusBadge status={status} />
    </div>
  );
}

export function DashboardStack() {
  return (
    <PageSections>
      <Section labelledBy="ps-attention">
        <SectionHeader
          id="ps-attention"
          title="Needs a look"
          description="These didn't go out, or are still publishing."
          meta={<span style={{ color: "var(--color-muted-foreground)" }}>2</span>}
        />
        <Row title="Weekly roundup" when="last Friday" status="FAILED" />
        <Row
          title="Product update thread"
          when="20 minutes ago"
          status="PUBLISHING"
        />
      </Section>
      <Section labelledBy="ps-upnext">
        <SectionHeader
          id="ps-upnext"
          title="Up next"
          actions={
            <Button variant="ghost" size="sm">
              View all scheduled
            </Button>
          }
        />
        <Row
          title="Spring launch teaser"
          when="tomorrow at 09:00"
          status="SCHEDULED"
        />
        <Row
          title="Behind the scenes clip"
          when="Saturday at 14:00"
          status="SCHEDULED"
        />
      </Section>
      <Section labelledBy="ps-recent">
        <SectionHeader
          id="ps-recent"
          title="Recent posts"
          description="Everything that went out in the last week."
        />
        <Row
          title="Customer story: Vela Studio"
          when="2 days ago"
          status="PUBLISHED"
        />
        <Row title="Office move photos" when="4 days ago" status="PUBLISHED" />
      </Section>
    </PageSections>
  );
}

export function TwoSections() {
  return (
    <div>
      <p style={caption}>
        Two sections, one gap. The rhythm is the same on every page — the
        stack never draws a rule of its own between siblings.
      </p>
      <PageSections>
        <Section labelledBy="ps-channels">
          <SectionHeader
            id="ps-channels"
            title="Your channels"
            description="Where your posts go."
          />
          <div style={rowStyle}>
            <span style={{ flex: 1 }}>Instagram — @velastudio</span>
            <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>
              connected
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ flex: 1 }}>Threads — Vela Studio</span>
            <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>
              reconnect needed
            </span>
          </div>
        </Section>
        <Section labelledBy="ps-times">
          <SectionHeader
            id="ps-times"
            title="Posting times"
            description="Drafts drop into the next free slot."
            actions={
              <Button variant="outline" size="sm">
                Edit times
              </Button>
            }
          />
          <div style={rowStyle}>
            <span style={{ flex: 1 }}>Weekdays</span>
            <span style={{ fontSize: 13, color: "var(--color-muted-foreground)" }}>
              09:00, 13:00, 17:30
            </span>
          </div>
        </Section>
      </PageSections>
    </div>
  );
}
