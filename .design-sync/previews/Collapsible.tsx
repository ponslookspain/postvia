import {
  Badge,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "postvia";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  AtSignIcon,
  BriefcaseIcon,
  SlidersHorizontalIcon,
  VideoIcon,
} from "lucide-react";

/**
 * Collapsible previews.
 *
 * `Collapsible` is a headless Radix root — the DS adds only the
 * open/close height animation on `CollapsibleContent` and no chrome at
 * all on the trigger, so every cell has to bring its own trigger row.
 * In this product it is the nav-group disclosure inside the sidebar
 * (`SidebarCollapsible` in `ui/sidebar.tsx` wraps exactly this), so the
 * cells are sidebar-shaped: a group header that opens a list of channels
 * or drafts.
 *
 * `Collapsible` takes `defaultOpen` (uncontrolled) — shown both ways so
 * the axis actually varies. Content is `hidden` when closed, which is
 * why the closed cell is deliberately just the trigger row.
 *
 * All scaffolding is inline `style`; the DS pieces (Badge) are styled
 * through their own props.
 */

const rail: React.CSSProperties = {
  width: 256,
  padding: 8,
  borderRadius: 12,
  background: "var(--color-muted)",
  border: "1px solid var(--color-border)",
  font: "400 14px/1.4 var(--font-body)",
  color: "var(--color-foreground)",
};

const triggerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  height: 32,
  padding: "0 8px",
  border: 0,
  borderRadius: 9999,
  background: "transparent",
  font: "500 14px/1 var(--font-body)",
  color: "var(--color-foreground)",
  cursor: "pointer",
  textAlign: "left",
};

const subRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 32,
  padding: "0 8px",
  marginLeft: 22,
  borderRadius: 9999,
  font: "400 13px/1 var(--font-body)",
  color: "var(--color-muted-foreground)",
};

const icon: React.CSSProperties = {
  width: 16,
  height: 16,
  flexShrink: 0,
  color: "var(--color-muted-foreground)",
};

const caption: React.CSSProperties = {
  font: "500 12px/1.4 var(--font-body)",
  color: "var(--color-muted-foreground)",
  letterSpacing: "0.02em",
  marginBottom: 8,
};

function Channels() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={subRow}>
        <AtSignIcon aria-hidden="true" style={icon} />
        <span>@postvia</span>
      </div>
      <div style={subRow}>
        <BriefcaseIcon aria-hidden="true" style={icon} />
        <span>Postvia HQ</span>
      </div>
      <div style={subRow}>
        <VideoIcon aria-hidden="true" style={icon} />
        <span>Postvia Shorts</span>
      </div>
    </div>
  );
}

export function NavGroupOpen() {
  return (
    <div>
      <p style={caption}>defaultOpen — sidebar nav group</p>
      <div style={rail}>
        <Collapsible defaultOpen>
          <CollapsibleTrigger style={triggerRow}>
            <ChevronDownIcon aria-hidden="true" style={icon} />
            <span style={{ flex: 1 }}>Channels</span>
            <Badge color="neutral" size="20">
              3
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Channels />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export function NavGroupClosed() {
  return (
    <div>
      <p style={caption}>closed — only the trigger row is rendered</p>
      <div style={rail}>
        <Collapsible>
          <CollapsibleTrigger style={triggerRow}>
            <ChevronRightIcon aria-hidden="true" style={icon} />
            <span style={{ flex: 1 }}>Channels</span>
            <Badge color="neutral" size="20">
              3
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Channels />
          </CollapsibleContent>
        </Collapsible>
        <Collapsible>
          <CollapsibleTrigger style={triggerRow}>
            <ChevronRightIcon aria-hidden="true" style={icon} />
            <span style={{ flex: 1 }}>Drafts</span>
            <Badge color="neutral" size="20">
              7
            </Badge>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div style={subRow}>
              <FileTextIcon aria-hidden="true" style={icon} />
              <span>Launch teaser</span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

export function FilterDisclosure() {
  return (
    <div style={{ width: 380 }}>
      <p style={caption}>inline disclosure — advanced post filters</p>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          background: "var(--color-background)",
          padding: 12,
        }}
      >
        <Collapsible defaultOpen>
          <CollapsibleTrigger
            style={{
              ...triggerRow,
              borderRadius: 8,
              padding: 0,
              height: 24,
            }}
          >
            <SlidersHorizontalIcon aria-hidden="true" style={icon} />
            <span style={{ flex: 1 }}>Advanced filters</span>
            <ChevronDownIcon aria-hidden="true" style={icon} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl
              style={{
                margin: "12px 0 0",
                display: "grid",
                gridTemplateColumns: "auto 1fr",
                rowGap: 8,
                columnGap: 16,
                font: "400 13px/1.4 var(--font-body)",
              }}
            >
              <dt style={{ color: "var(--color-muted-foreground)" }}>Channel</dt>
              <dd style={{ margin: 0, color: "var(--color-foreground)" }}>
                Instagram, TikTok
              </dd>
              <dt style={{ color: "var(--color-muted-foreground)" }}>Window</dt>
              <dd style={{ margin: 0, color: "var(--color-foreground)" }}>
                Next 14 days
              </dd>
              <dt style={{ color: "var(--color-muted-foreground)" }}>Author</dt>
              <dd style={{ margin: 0, color: "var(--color-foreground)" }}>Anyone</dd>
            </dl>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
