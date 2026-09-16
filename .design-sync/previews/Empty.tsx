import {
  Button,
  Empty,
  EmptyAction,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "postvia";
import { CalendarDaysIcon, FileTextIcon, UsersIcon } from "lucide-react";

/**
 * Empty previews. Every cell is the composition `StateBlock.EmptyBlock`
 * builds (`Empty > EmptyHeader > EmptyMedia variant="icon" + EmptyTitle +
 * EmptyDescription`, then `EmptyContent` for the actions), which is how
 * the dashboard, posts list, calendar and composer all render their
 * zero states. Copy is written as sentences, per the Voice rules.
 */

const stage: React.CSSProperties = { width: 420, display: "flex" };

export function FirstRun() {
  return (
    <div style={stage}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle>Start publishing in two steps</EmptyTitle>
          <EmptyDescription>
            Connect a social profile first, then create your first post.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <EmptyAction>
            <Button size="sm">Connect account</Button>
            <Button variant="outline" size="sm">
              Create a post
            </Button>
          </EmptyAction>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function NoMatchingPosts() {
  return (
    <div style={stage}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileTextIcon />
          </EmptyMedia>
          <EmptyTitle>No matching posts</EmptyTitle>
          <EmptyDescription>
            Nothing matches the current search and filters.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <EmptyAction>
            <Button variant="outline" size="sm">
              Clear search and filters
            </Button>
          </EmptyAction>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function NothingScheduled() {
  return (
    <div style={stage}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDaysIcon />
          </EmptyMedia>
          <EmptyTitle>Nothing lined up this week</EmptyTitle>
          <EmptyDescription>
            Drag a draft onto a day, or schedule one from the composer.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

export function PlainMedia() {
  return (
    <div style={stage}>
      <Empty>
        <EmptyHeader>
          <EmptyMedia>
            <FileTextIcon style={{ width: 28, height: 28, opacity: 0.45 }} />
          </EmptyMedia>
          <EmptyTitle>No drafts</EmptyTitle>
          <EmptyDescription>
            The default media variant is untinted — it carries no box and no
            accent, for a quiet state nested inside a block.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
