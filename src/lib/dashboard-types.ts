/**
 * Dashboard shared view-model types.
 *
 * Single source of truth for the dashboard channel/outcome shapes.
 * Lives in `src/lib` (not `src/app`) so the server-side data layer
 * (`src/lib/dashboard.ts`) does not depend on `src/app/**`:
 * dependency direction is always `app → lib`, never `lib → app`.
 *
 * Pure types only — no Prisma, no I/O, safe to import from server
 * components, client components, and the data layer alike.
 */

export type ChannelRow = {
  platform: string;
  usernames: string[];
  expired: boolean;
  published: number;
  lastPublishedLabel: string | null;
};

export type OutcomeSegment = {
  label: string;
  value: number;
  /** Stroke color class for the SVG arc. */
  className: string;
  /** Fill color class for the legend dot. */
  dotClassName: string;
};
