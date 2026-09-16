import { Badge, Button, SectionHeader } from "postvia";
import { PlusIcon } from "lucide-react";

/**
 * SectionHeader previews — the four props swept one axis at a time:
 * title alone, title + description (14px muted, capped at the prose
 * measure), trailing actions, and quiet meta beside the actions.
 * Sections are never numbered, so no cell carries an eyebrow or index.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

const rule: React.CSSProperties = {
  borderTop: "1px solid var(--border)",
  paddingTop: 10,
  fontSize: 14,
  color: "var(--color-muted-foreground)",
};

export function TitleOnly() {
  return (
    <div>
      <SectionHeader title="Up next" />
      <div style={rule}>Spring launch teaser — tomorrow at 09:00</div>
    </div>
  );
}

export function WithDescription() {
  return (
    <div>
      <SectionHeader
        title="Your channels"
        description="Where your posts go. Connect a profile on each channel to publish to it."
      />
      <div style={rule}>Instagram, Threads and X are connected</div>
    </div>
  );
}

export function WithActions() {
  return (
    <div>
      <SectionHeader
        title="Scheduled posts"
        description="Nothing has gone out this month yet — 3 posts are lined up."
        actions={
          <>
            <Button variant="outline" size="sm">
              Reschedule
            </Button>
            <Button size="sm">
              <PlusIcon data-icon="inline-start" />
              Create post
            </Button>
          </>
        }
      />
      <div style={rule}>Behind the scenes clip — Saturday at 14:00</div>
    </div>
  );
}

export function WithMeta() {
  return (
    <div>
      <p style={caption}>
        Meta sits before the actions in the same trailing group, so a count
        reads as part of the title row rather than as a control.
      </p>
      <SectionHeader
        title="Needs a look"
        description="These didn't go out, or are still publishing."
        meta={
          <Badge color="error" variant="soft">
            2
          </Badge>
        }
        actions={
          <Button variant="ghost" size="sm">
            View all
          </Button>
        }
      />
      <div style={rule}>Weekly roundup — failed last Friday</div>
    </div>
  );
}
