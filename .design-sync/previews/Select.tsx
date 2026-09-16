import {
  Select,
  SelectContent,
  SelectDivider,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "postvia";

/**
 * Select previews, ported from the app's real filters: the dashboard status
 * filter (DashboardPostFilter), the bulk scheduler's time-zone picker
 * (BulkScheduler) and the TikTok privacy picker (TiktokTargetSettings). The
 * three list cells are `defaultOpen` so the portal content is captured; the
 * last cell shows the closed trigger across the size axis. Scaffolding uses
 * inline styles, never Tailwind utilities.
 */

export function StatusFilter() {
  return (
    <div style={{ padding: 16, width: 260 }}>
      <Select defaultValue="SCHEDULED" defaultOpen>
        <SelectTrigger aria-label="Filter by status" style={{ width: "100%" }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="ALL">All posts</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="SCHEDULED">Scheduled</SelectItem>
            <SelectItem value="PUBLISHED">Published</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TimeZonePicker() {
  return (
    <div style={{ padding: 16, width: 280 }}>
      <Select defaultValue="Europe/Madrid" defaultOpen>
        <SelectTrigger style={{ width: "100%" }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Europe</SelectLabel>
            <SelectItem value="Europe/London">Europe/London</SelectItem>
            <SelectItem value="Europe/Madrid">Europe/Madrid</SelectItem>
            <SelectItem value="Europe/Berlin">Europe/Berlin</SelectItem>
          </SelectGroup>
          <SelectDivider />
          <SelectGroup>
            <SelectLabel>Americas</SelectLabel>
            <SelectItem value="America/New_York">America/New York</SelectItem>
            <SelectItem value="America/Los_Angeles">
              America/Los Angeles
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function IndicatorLeft() {
  return (
    <div style={{ padding: 16, width: 260 }}>
      <Select defaultValue="PUBLIC_TO_EVERYONE" defaultOpen indicatorPosition="left">
        <SelectTrigger aria-label="TikTok privacy level" style={{ width: "100%" }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="PUBLIC_TO_EVERYONE">Everyone</SelectItem>
            <SelectItem value="MUTUAL_FOLLOW_FRIENDS">Friends</SelectItem>
            <SelectItem value="SELF_ONLY">Only me</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

export function TriggerSizes() {
  return (
    <div
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: 260,
      }}
    >
      {(["28", "32", "36", "44"] as const).map((size) => (
        <Select key={size} defaultValue="instagram">
          <SelectTrigger size={size} style={{ width: "100%" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="threads">Threads</SelectItem>
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
