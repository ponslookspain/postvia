import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
} from "postvia";

/**
 * `SidebarMenuSkeleton` previews.
 *
 * The render check flagged this component `[RENDER_BLANK]`: on its own
 * it is a single 32px row holding one `Skeleton` bar whose width is a
 * lazily-initialised random 50–90%, so a bare render reads as nothing.
 * It is only legible as a *stack* standing in for the nav rail while
 * the workspace loads, which is how every cell here mounts it.
 *
 * `showIcon` is the only prop: `false` (default) is a text bar alone,
 * `true` prepends a 16px square for the nav icon. The product's nav
 * rows all carry icons, so the loading rail uses `showIcon`.
 *
 * Surface matters here. `Skeleton` is `bg-accent`, and in the LIGHT theme
 * these previews render in, `--accent` is aliased to `--muted`, so
 * `--color-accent` and `--color-muted` are the same colour — a skeleton
 * laid on a `fill1` panel is invisible. The standalone cells therefore
 * sit on `--color-background`; `LoadingRail` sits on the real rail, which is
 * `--color-sidebar` (a shade lighter than `fill1`) and still reads.
 *
 * Widths genuinely differ per row — that is the component's own
 * randomiser, not preview noise, and it is what makes the stack read as
 * labels of different lengths.
 */

const caption: React.CSSProperties = {
  font: "500 12px/1.4 var(--font-body)",
  color: "var(--color-muted-foreground)",
  letterSpacing: "0.02em",
  marginBottom: 8,
};

const panel: React.CSSProperties = {
  width: 256,
  boxSizing: "border-box",
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-background)",
  padding: 8,
};

const groupLabel: React.CSSProperties = {
  font: "500 12px/1.4 var(--font-body)",
  color: "var(--color-muted-foreground)",
  padding: "6px 8px 2px",
};

/** The whole rail mid-load: wordmark header, then six icon+label rows. */
export function LoadingRail() {
  return (
    <div>
      <p style={caption}>nav rail while the workspace loads</p>
      <div
        style={{
          width: 258,
          height: 342,
          boxSizing: "border-box",
          overflow: "hidden",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
        }}
      >
        <SidebarProvider>
          <Sidebar collapsible="none" theme="gray" style={{ height: 340 }}>
            <SidebarHeader
              style={{
                borderBottom: "1px solid var(--color-border)",
                padding: "14px 16px",
              }}
            >
              <p
                style={{
                  margin: 0,
                  font: "600 18px/1.2 var(--font-heading)",
                  letterSpacing: "-0.01em",
                  color: "var(--color-foreground)",
                }}
              >
                postvia
              </p>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu style={{ gap: 4 }}>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <SidebarMenuItem key={i}>
                        <SidebarMenuSkeleton showIcon />
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </div>
    </div>
  );
}

/** showIcon — the placeholder square that stands in for the nav icon. */
export function WithIcon() {
  return (
    <div>
      <p style={caption}>showIcon</p>
      <div style={panel}>
        <SidebarMenu style={{ gap: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    </div>
  );
}

/** Default — text bar only, for a sub-menu or a label-only list. */
export function TextOnly() {
  return (
    <div>
      <p style={caption}>default (showIcon omitted)</p>
      <div style={panel}>
        <SidebarMenu style={{ gap: 4 }}>
          {[0, 1, 2, 3].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    </div>
  );
}

/** Two labelled groups loading at once — the shape of a full workspace. */
export function GroupedLoading() {
  return (
    <div>
      <p style={caption}>grouped — labels resolve before their rows</p>
      <div style={panel}>
        <p style={{ ...groupLabel, margin: 0 }}>Workspace</p>
        <SidebarMenu style={{ gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        <p style={{ ...groupLabel, margin: "8px 0 0" }}>Channels</p>
        <SidebarMenu style={{ gap: 4 }}>
          {[0, 1].map((i) => (
            <SidebarMenuItem key={i}>
              <SidebarMenuSkeleton showIcon />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </div>
    </div>
  );
}
