import {
  Avatar,
  AvatarFallback,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "postvia";
import {
  CalendarIcon,
  ChevronsUpDownIcon,
  ClapperboardIcon,
  FileTextIcon,
  LayoutGridIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react";

/**
 * Sidebar previews.
 *
 * Ported from the product composition in `src/components/Sidebar.tsx` +
 * `src/components/AppShell.tsx`: `SidebarProvider` wraps `Sidebar` and
 * `SidebarInset` as direct siblings (the inset's `peer-data-*` styles
 * only resolve that way), the rail is `variant="inset" theme="gray"
 * collapsible="icon"`, and every nav item is a pill (`rounded-full` —
 * the one utility class used here, and it is already in the stylesheet
 * because the product sidebar uses it) whose active state is a quiet
 * neutral fill. The brand red is reserved for actions, so `isActive`
 * stays on the default `variant="neutral"`.
 *
 * `next/navigation` cannot resolve in this bundle, so route detection is
 * replaced by a plain `isActive` prop and the nav rows are `<button>`s
 * rather than `asChild` + `<Link>`.
 *
 * Geometry: the rail is `fixed inset-y-0 … h-svh`. Each cell therefore
 * mounts inside a `Stage` that sets `transform: translateZ(0)`, which
 * makes the stage the containing block for that fixed child, plus
 * `overflow: hidden` so the rail is cropped to the card instead of
 * bleeding past the capture viewport. `h-svh` on its own resolves to
 * 700px here and pushes `SidebarFooter` below the fold, so the shell
 * cells pass an explicit `height` — `Sidebar` spreads its rest props
 * (and therefore `style`) onto the `sidebar-container` element that
 * carries `h-svh`, and `SidebarInset` spreads onto its `<main>`, which
 * in the inset variant has an 8px margin top and bottom.
 */

const STAGE_H = 560;

const NAV = [
  { label: "Dashboard", icon: LayoutGridIcon },
  { label: "Posts", icon: FileTextIcon },
  { label: "Calendar", icon: CalendarIcon },
  { label: "Create post", icon: PlusIcon },
  { label: "Bulk video", icon: ClapperboardIcon },
  { label: "Accounts", icon: UsersIcon },
];

function Stage({
  children,
  height = STAGE_H,
}: {
  children: React.ReactNode;
  height?: number;
}) {
  return (
    <div
      style={{
        position: "relative",
        transform: "translateZ(0)",
        height,
        width: "100%",
        overflow: "hidden",
        borderRadius: 12,
      }}
    >
      {children}
    </div>
  );
}

const wordmark: React.CSSProperties = {
  margin: 0,
  font: "600 18px/1.2 var(--font-heading)",
  letterSpacing: "-0.01em",
  color: "var(--color-foreground)",
};

const headerStyle: React.CSSProperties = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  borderBottom: "1px solid var(--color-border)",
  padding: "14px 16px",
};

const collapsedHeaderStyle: React.CSSProperties = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  borderBottom: "1px solid var(--color-border)",
  padding: "14px 6px",
};

function NavGroup({ active = "Posts" }: { active?: string }) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu style={{ gap: 4 }}>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  className="rounded-full"
                  isActive={item.label === active}
                  tooltip={item.label}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AccountFooter({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <SidebarFooter
      style={{
        borderTop: "1px solid var(--color-border)",
        padding: collapsed ? 8 : 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? 4 : "6px 6px",
          borderRadius: 8,
        }}
      >
        <Avatar>
          <AvatarFallback>M</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <div
              style={{
                minWidth: 0,
                flex: 1,
                font: "500 14px/1.35 var(--font-sans)",
                color: "var(--color-foreground)",
              }}
            >
              <p style={{ margin: 0 }}>Mara Oyelaran</p>
              <p
                style={{
                  margin: 0,
                  font: "400 12px/1.35 var(--font-sans)",
                  color: "var(--color-muted-foreground)",
                }}
              >
                mara@postvia.app
              </p>
            </div>
            <ChevronsUpDownIcon
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                flexShrink: 0,
                color: "var(--color-muted-foreground)",
              }}
            />
          </>
        )}
      </div>
    </SidebarFooter>
  );
}

function InsetPage() {
  return (
    <SidebarInset style={{ height: STAGE_H - 16 }}>
      <div style={{ padding: 24 }}>
        <h2
          style={{
            margin: 0,
            font: "600 22px/1.2 var(--font-heading)",
            letterSpacing: "-0.01em",
            color: "var(--color-foreground)",
          }}
        >
          Posts
        </h2>
        <p
          style={{
            margin: "6px 0 20px",
            font: "400 14px/1.5 var(--font-sans)",
            color: "var(--color-muted-foreground)",
          }}
        >
          Everything you have drafted, scheduled or published.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            "Launch teaser — Instagram",
            "Behind the scenes — TikTok",
            "Hiring update — X",
          ].map((t) => (
            <div
              key={t}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                padding: "12px 14px",
                font: "400 14px/1.4 var(--font-sans)",
                color: "var(--color-foreground)",
                background: "var(--color-background)",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    </SidebarInset>
  );
}

/** The canonical app shell: expanded 16rem rail beside the inset panel. */
export function AppShellExpanded() {
  return (
    <Stage>
      <SidebarProvider>
        <Sidebar
          variant="inset"
          collapsible="icon"
          theme="gray"
          style={{ height: STAGE_H }}
        >
          <SidebarHeader style={headerStyle}>
            <p style={wordmark}>postvia</p>
            <SidebarTrigger aria-label="Collapse sidebar" />
          </SidebarHeader>
          <SidebarContent>
            <NavGroup active="Posts" />
            <div style={{ padding: "4px 12px 8px" }}>
              <div
                style={{
                  borderRadius: 12,
                  background: "var(--color-background)",
                  padding: 12,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    font: "500 14px/1.35 var(--font-sans)",
                    color: "var(--color-foreground)",
                  }}
                >
                  <SparklesIcon
                    aria-hidden="true"
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  Unlock more with Postvia
                </p>
                <p
                  style={{
                    margin: "4px 0 0",
                    font: "400 12px/1.4 var(--font-sans)",
                    color: "var(--color-muted-foreground)",
                  }}
                >
                  More posts, more accounts and Bulk scheduling.
                </p>
              </div>
            </div>
          </SidebarContent>
          <AccountFooter />
        </Sidebar>
        <InsetPage />
      </SidebarProvider>
    </Stage>
  );
}

/** Same rail with `open={false}` — the 3rem icon-collapsed geometry. */
export function AppShellIconCollapsed() {
  return (
    <Stage>
      <SidebarProvider open={false}>
        <Sidebar
          variant="inset"
          collapsible="icon"
          theme="gray"
          style={{ height: STAGE_H }}
        >
          <SidebarHeader style={collapsedHeaderStyle}>
            <SidebarTrigger aria-label="Expand sidebar" />
          </SidebarHeader>
          <SidebarContent>
            <NavGroup active="Posts" />
          </SidebarContent>
          <AccountFooter collapsed />
        </Sidebar>
        <InsetPage />
      </SidebarProvider>
    </Stage>
  );
}

/**
 * Rail-only card for the pieces that hang off a menu row: group label +
 * action, search input, badge, hover action, sub-menu and separator.
 * `collapsible="none"` renders the plain sticky rail (no fixed
 * container), which keeps this cell self-contained.
 */
export function RailAffordances() {
  return (
    <Stage height={520}>
      <SidebarProvider>
        <Sidebar collapsible="none" theme="gray" style={{ height: "100%" }}>
          <SidebarHeader style={{ padding: "12px 12px 8px" }}>
            <SidebarInput placeholder="Search posts" />
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Workspace</SidebarGroupLabel>
              <SidebarGroupAction aria-label="Add channel">
                <PlusIcon aria-hidden="true" />
              </SidebarGroupAction>
              <SidebarGroupContent>
                <SidebarMenu style={{ gap: 4 }}>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="rounded-full" isActive>
                      <FileTextIcon aria-hidden="true" />
                      <span>Posts</span>
                    </SidebarMenuButton>
                    <SidebarMenuBadge>12</SidebarMenuBadge>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="rounded-full">
                      <CalendarIcon aria-hidden="true" />
                      <span>Calendar</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction aria-label="Calendar options">
                      <MoreHorizontalIcon aria-hidden="true" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="rounded-full">
                      <UsersIcon aria-hidden="true" />
                      <span>Accounts</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton isActive>
                          <span>@postvia</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton>
                          <span>Postvia HQ</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                      <SidebarMenuSubItem>
                        <SidebarMenuSubButton size="28">
                          <span>Postvia Shorts</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Recent</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu style={{ gap: 4 }}>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="rounded-full">
                      <SearchIcon aria-hidden="true" />
                      <span>Saved search: failed</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </Stage>
  );
}

/**
 * `SidebarMenuButton` tone. `neutral` is the only variant — a quiet fill
 * for the active row, never the brand hue (see docs/design-system.md,
 * Navigation). History: `soft` and `strong` variants put the brand hue on
 * the active row; they had zero call sites and were removed, resolving the
 * contradiction rather than documenting it.
 */
export function MenuButtonVariants() {
  return (
    <Stage height={240}>
      <SidebarProvider>
        <Sidebar collapsible="none" theme="gray" style={{ height: "100%" }}>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>neutral (the only variant)</SidebarGroupLabel>
              <SidebarMenu style={{ gap: 4 }}>
                <SidebarMenuItem>
                  <SidebarMenuButton className="rounded-full" isActive>
                    <LayoutGridIcon aria-hidden="true" />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton className="rounded-full">
                    <FileTextIcon aria-hidden="true" />
                    <span>Posts</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      </SidebarProvider>
    </Stage>
  );
}
