import {
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "postvia";
import {
  CalendarDaysIcon,
  CreditCardIcon,
  ImageIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";

/**
 * Tabs previews.
 *
 * The product's only call site is `src/app/posts/StatusTabs.tsx`: a
 * segmented status filter above the Posts list whose selection is
 * URL-driven (each trigger is a Link, the root is remounted per value).
 * `StatusFilter` ports that composition verbatim, minus the `next/link`
 * wrapper which cannot resolve in this bundle.
 *
 * The remaining cells walk the axes the source actually exposes:
 * `TabsList variant` = default | open | ghost (read through context by
 * every `TabsTrigger`, so it is set once on the list) and
 * `width` = fit | full, plus `orientation` on the root.
 *
 * Scaffolding is inline `style` only — the stylesheet was scanned before
 * this file existed, so a utility class used only here would not exist.
 */

const stage: React.CSSProperties = {
  width: 560,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const caption: React.CSSProperties = {
  font: "500 12px/1.4 var(--font-sans)",
  color: "var(--color-muted-foreground)",
  letterSpacing: "0.02em",
};

const panel: React.CSSProperties = {
  font: "400 14px/1.6 var(--font-sans)",
  color: "var(--color-muted-foreground)",
  paddingTop: 4,
};

export function StatusFilter() {
  return (
    <div style={stage}>
      <p style={caption}>Posts — filter by status</p>
      <Tabs defaultValue="SCHEDULED">
        <TabsList
          aria-label="Filter posts by status"
          style={{ display: "flex", flexWrap: "wrap" }}
        >
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="DRAFT">Draft</TabsTrigger>
          <TabsTrigger value="SCHEDULED">Scheduled</TabsTrigger>
          <TabsTrigger value="PUBLISHED">Published</TabsTrigger>
          <TabsTrigger value="FAILED">Failed</TabsTrigger>
        </TabsList>
        <TabsContent value="SCHEDULED">
          <p style={panel}>
            8 scheduled posts across Instagram, TikTok and Threads.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function UnderlineSections() {
  return (
    <div style={stage}>
      <p style={caption}>variant=&quot;open&quot; — page sections</p>
      <Tabs defaultValue="overview">
        <TabsList variant="open" width="full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="schedule">
            <CalendarDaysIcon aria-hidden="true" />
            Schedule
          </TabsTrigger>
          <TabsTrigger value="media">
            <ImageIcon aria-hidden="true" />
            Media
          </TabsTrigger>
          <TabsTrigger value="archive" disabled>
            Archive
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <p style={panel}>
            Reach is up 12% week over week. Three drafts are waiting on
            approval before Friday&rsquo;s batch goes out.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function GhostSegments() {
  return (
    <div style={stage}>
      <p style={caption}>variant=&quot;ghost&quot; — calendar range</p>
      <Tabs defaultValue="month">
        <TabsList variant="ghost">
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
        </TabsList>
        <TabsContent value="month">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingTop: 4,
            }}
          >
            <span style={panel}>May 2024</span>
            <Badge color="neutral" size="20">
              24 posts
            </Badge>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function VerticalSettings() {
  return (
    <div style={{ ...stage, width: 520 }}>
      <p style={caption}>orientation=&quot;vertical&quot;</p>
      <Tabs
        defaultValue="accounts"
        orientation="vertical"
        style={{ minHeight: 148 }}
      >
        <TabsList variant="open" style={{ minWidth: 148 }}>
          <TabsTrigger value="profile">
            <SettingsIcon aria-hidden="true" />
            General
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <UsersIcon aria-hidden="true" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCardIcon aria-hidden="true" />
            Billing
          </TabsTrigger>
        </TabsList>
        <TabsContent value="accounts" style={{ paddingLeft: 16 }}>
          <p style={panel}>
            Four channels connected. Instagram needs to be re-authorised
            before the next publish window.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
