import { Badge, Button, PageHeader, StatusBadge } from "postvia";
import { ClapperboardIcon, PlusIcon } from "lucide-react";

/**
 * PageHeader previews — one per page, taken from the pages that ship it:
 * Posts (title + description + two actions), Connected accounts (a quiet
 * count as the only action), the composer (title alone) and a post detail
 * header. No eyebrows and no numbering: the 24px title carries hierarchy.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-fg-tertiary)",
};

const rule: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 10,
  fontSize: 14,
  color: "var(--color-fg-tertiary)",
};

export function WithActions() {
  return (
    <div>
      <PageHeader
        title="Posts"
        description="Manage your content, scheduled posts and publishing activity"
        actions={
          <>
            <Button variant="outline" size="sm">
              <ClapperboardIcon data-icon="inline-start" />
              Bulk video
            </Button>
            <Button size="sm">
              <PlusIcon data-icon="inline-start" />
              Create post
            </Button>
          </>
        }
      />
      <div style={rule}>12 posts — 3 scheduled, 1 needs a look</div>
    </div>
  );
}

export function WithDescription() {
  return (
    <div>
      <PageHeader
        title="Connected accounts"
        description="Choose where your posts go. Connect a profile on each channel to publish to it."
        actions={<Badge variant="outline">6 of 10 connected accounts</Badge>}
      />
      <div style={rule}>Instagram, Threads and X are connected</div>
    </div>
  );
}

export function TitleOnly() {
  return (
    <div>
      <p style={caption}>
        The composer opens with the bare title — the page below it says what
        to do, so the header does not repeat it.
      </p>
      <PageHeader title="Create post" />
      <div style={rule}>Pick the channels this goes out on</div>
    </div>
  );
}

export function DetailHeader() {
  return (
    <div>
      <PageHeader
        title="Spring launch teaser"
        description="Goes out tomorrow at 09:00 to Instagram and Threads."
        actions={
          <>
            <StatusBadge status="SCHEDULED" />
            <Button variant="outline" size="sm">
              Edit
            </Button>
            <Button variant="ghost" size="sm">
              Duplicate
            </Button>
          </>
        }
      />
      <div style={rule}>Created 4 days ago by Rosa</div>
    </div>
  );
}
