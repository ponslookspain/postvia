import { Button, EmptyBlock } from "postvia";
import {
  CalendarDaysIcon,
  FileTextIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";

/**
 * EmptyBlock previews. Each zero state gets one invitation to act, in
 * the product's voice: say what isn't there, then what to do about it.
 * Taken from the dashboard first run, the posts list (unfiltered and
 * filtered) and the calendar month view.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

export function FirstRun() {
  return (
    <EmptyBlock
      icon={<UsersIcon />}
      title="Start publishing in two steps"
      description="Connect a social profile first, then create your first post."
      actions={
        <>
          <Button size="sm">Connect account</Button>
          <Button variant="outline" size="sm">
            <PlusIcon data-icon="inline-start" />
            Create post
          </Button>
        </>
      }
    />
  );
}

export function NoPostsYet() {
  return (
    <EmptyBlock
      icon={<FileTextIcon />}
      title="No posts yet"
      description="Create your first post to get started."
      actions={
        <Button size="sm">
          <PlusIcon data-icon="inline-start" />
          Create post
        </Button>
      }
    />
  );
}

export function NoMatchingPosts() {
  return (
    <div>
      <p style={caption}>
        A filtered empty is a different message from a true empty — it
        offers the way back out, not the way in.
      </p>
      <EmptyBlock
        icon={<FileTextIcon />}
        title="No matching posts"
        description="Nothing matches the current search and filters."
        actions={
          <Button variant="outline" size="sm">
            Clear search and filters
          </Button>
        }
      />
    </div>
  );
}

export function NothingScheduled() {
  return (
    <div>
      <p style={caption}>
        Without actions the block stays quiet — the calendar already has a
        create button in its header, and a thing is said once.
      </p>
      <EmptyBlock
        icon={<CalendarDaysIcon />}
        title="Nothing scheduled this month"
        description="Nothing has gone out this month yet — create a post or schedule a draft to see it here."
      />
    </div>
  );
}
