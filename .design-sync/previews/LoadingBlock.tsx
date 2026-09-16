import { LoadingBlock, SectionHeader } from "postvia";

/**
 * LoadingBlock previews. It is a skeleton stack sized to the rows it is
 * standing in for, so each cell pairs it with the header it appears
 * under on the real route: the posts list (5 rows at row height), the
 * dashboard (3 cards) and the accounts grid (tall channel cards).
 * `label` is announced, not drawn — it never renders as visible text.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-fg-tertiary)",
};

export function PostsLoading() {
  return (
    <div>
      <SectionHeader
        title="Posts"
        description="Loading the list — the skeleton matches the row height it replaces."
      />
      <LoadingBlock rows={5} rowClassName="h-20 w-full" label="Loading posts" />
    </div>
  );
}

export function DashboardLoading() {
  return (
    <div>
      <p style={caption}>
        Rounded rows, matching the dashboard&apos;s card stack.
      </p>
      <LoadingBlock
        rows={3}
        rowClassName="h-20 w-full rounded-xl"
        label="Loading your dashboard"
      />
    </div>
  );
}

export function AccountsLoading() {
  return (
    <div>
      <p style={caption}>
        Channel cards are tall, so the accounts route asks for tall rows.
      </p>
      <LoadingBlock
        rows={2}
        rowClassName="h-44 w-full rounded-xl"
        label="Loading connected accounts"
      />
    </div>
  );
}

export function DefaultRows() {
  return (
    <div>
      <p style={caption}>
        Defaults: three rows at <code>h-24 w-full</code>, stacked on a 1rem gap.
      </p>
      <LoadingBlock />
    </div>
  );
}
