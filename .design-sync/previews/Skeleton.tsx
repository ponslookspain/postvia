import { Skeleton } from "postvia";

/**
 * Skeleton previews. Skeleton is `bg-muted animate-pulse rounded-xl` and
 * carries no size of its own — the caller gives it the shape of the thing
 * it stands in for. These cells port the real route-level loading files
 * (`src/app/dashboard/loading.tsx`, `src/app/calendar/loading.tsx`):
 * a header, a post row, a channel list. Sizes are set with inline styles
 * so the shapes survive a stylesheet that was scanned before this file
 * existed. The pulse is captured at an arbitrary opacity, which is fine —
 * the layout is what has to read.
 */

const stage: React.CSSProperties = {
  width: 420,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const row: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};

export function PageHeader() {
  return (
    <div style={stage}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton style={{ height: 32, width: 208 }} />
          <Skeleton style={{ height: 20, width: 320, maxWidth: "100%" }} />
        </div>
        <Skeleton
          style={{ height: 36, width: 128, flexShrink: 0, borderRadius: 9999 }}
        />
      </div>
    </div>
  );
}

export function PostRows() {
  return (
    <div style={stage}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={row}>
          <Skeleton
            style={{
              height: 36,
              width: 36,
              flexShrink: 0,
              borderRadius: 9999,
            }}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              flex: 1,
            }}
          >
            <Skeleton style={{ height: 16, width: i === 1 ? 240 : 288 }} />
            <Skeleton style={{ height: 12, width: 144 }} />
          </div>
          <Skeleton
            style={{ height: 20, width: 64, flexShrink: 0, borderRadius: 9999 }}
          />
        </div>
      ))}
    </div>
  );
}

export function DashboardBlock() {
  return (
    <div style={stage}>
      <Skeleton style={{ height: 192, width: "100%", borderRadius: 16 }} />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Skeleton style={{ height: 24, width: 128 }} />
        <Skeleton style={{ height: 16, width: 64 }} />
      </div>
      <Skeleton style={{ height: 56, width: "100%", borderRadius: 12 }} />
    </div>
  );
}

export function CalendarStrip() {
  return (
    <div style={stage}>
      <div style={{ display: "flex", gap: 8 }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton
            key={i}
            style={{ height: 64, flex: 1, borderRadius: 8 }}
          />
        ))}
      </div>
      <Skeleton style={{ height: 52, width: "100%", borderRadius: 8 }} />
      <Skeleton style={{ height: 52, width: "100%", borderRadius: 8 }} />
    </div>
  );
}
