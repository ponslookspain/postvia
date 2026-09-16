import {
  Badge,
  Button,
  PageContainer,
  PageHeader,
  PageSections,
  Section,
  SectionHeader,
  StatusBadge,
} from "postvia";
import { PlusIcon } from "lucide-react";

/**
 * PageContainer previews. The container itself is invisible — what it
 * does is set the measure, the fluid gutter and the vertical padding for
 * one page — so every cell renders the page that would sit inside it:
 * a PageHeader, then rule-separated sections. The `size` axis is shown
 * as an annotated comparison because 48/64/76rem are all wider than a
 * card cell.
 */

const caption: React.CSSProperties = {
  margin: "0 0 10px",
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

function PostRow({
  title,
  when,
  status,
}: {
  title: string;
  when: string;
  status: string;
}) {
  return (
    <div style={rowStyle}>
      <span style={{ minWidth: 0, flex: 1 }}>{title}</span>
      <span style={{ color: "var(--color-fg-tertiary)", fontSize: 13 }}>
        {when}
      </span>
      <StatusBadge status={status} />
    </div>
  );
}

export function DefaultPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Posts"
        description="Manage your content, scheduled posts and publishing activity"
        actions={
          <Button size="sm">
            <PlusIcon data-icon="inline-start" />
            Create post
          </Button>
        }
      />
      <PageSections>
        <Section labelledBy="pc-upnext">
          <SectionHeader
            id="pc-upnext"
            title="Up next"
            description="The next three posts due to go out."
          />
          <PostRow
            title="Spring launch teaser"
            when="tomorrow at 09:00"
            status="SCHEDULED"
          />
          <PostRow
            title="Behind the scenes clip"
            when="Saturday at 14:00"
            status="SCHEDULED"
          />
        </Section>
        <Section labelledBy="pc-recent">
          <SectionHeader
            id="pc-recent"
            title="Recent posts"
            actions={
              <Button variant="ghost" size="sm">
                View all
              </Button>
            }
          />
          <PostRow
            title="Customer story: Vela Studio"
            when="2 days ago"
            status="PUBLISHED"
          />
          <PostRow
            title="Weekly roundup"
            when="last Friday"
            status="FAILED"
          />
        </Section>
      </PageSections>
    </PageContainer>
  );
}

export function NarrowForm() {
  return (
    <div>
      <p style={caption}>size=&quot;narrow&quot; — 48rem, used by Billing and Settings</p>
      <PageContainer size="narrow">
        <PageHeader
          title="Billing"
          description="Your plan, your usage and where the invoices go."
          actions={<Badge variant="outline">Pro</Badge>}
        />
        <PageSections>
          <Section labelledBy="pc-plan">
            <SectionHeader
              id="pc-plan"
              title="Plan"
              description="Pro renews on 1 October. Cancelling keeps your posts."
              actions={
                <Button variant="outline" size="sm">
                  Change plan
                </Button>
              }
            />
            <div style={rowStyle}>
              <span>Connected accounts</span>
              <span style={{ color: "var(--color-fg-tertiary)" }}>
                6 of 10
              </span>
            </div>
            <div style={rowStyle}>
              <span>Posts this month</span>
              <span style={{ color: "var(--color-fg-tertiary)" }}>
                48 of 500
              </span>
            </div>
          </Section>
        </PageSections>
      </PageContainer>
    </div>
  );
}

const SIZES: Array<[string, string, number, string]> = [
  ["narrow", "48rem / 768px", 768, "Billing, Settings, single-column forms"],
  ["default", "64rem / 1024px", 1024, "Dashboard, Posts, Accounts"],
  ["wide", "76rem / 1216px", 1216, "Calendar, composers"],
];

export function WidthScale() {
  return (
    <div>
      <p style={caption}>
        The three measures, drawn to scale. Each bar is the container&apos;s
        max-width; the page is left-aligned inside the shell&apos;s main column.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {SIZES.map(([name, measure, px, pages]) => (
          <div key={name}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 500 }}>
                size=&quot;{name}&quot;
              </span>
              <span style={{ fontSize: 12, color: "var(--color-fg-tertiary)" }}>
                {measure}
              </span>
            </div>
            <div
              style={{
                width: `${(px / 1216) * 100}%`,
                height: 28,
                borderRadius: 6,
                background: "var(--muted)",
                border: "1px solid var(--border)",
              }}
            />
            <p
              style={{
                margin: "6px 0 0",
                fontSize: 12,
                color: "var(--color-fg-tertiary)",
              }}
            >
              {pages}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
