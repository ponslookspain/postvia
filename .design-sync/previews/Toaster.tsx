import * as React from "react";
import {
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastIcon,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  useToastManager,
} from "postvia";

/**
 * Toaster previews.
 *
 * `Toaster` itself is the host: a `ToastProvider` wrapping a portalled,
 * `position: fixed` `ToastViewport`. Rendered as-is it paints nothing (no
 * toasts) and what it does paint escapes the card cell into the page
 * corner. So each cell mounts the same parts `Toaster` mounts —
 * `ToastProvider + ToastViewport + Toast/ToastContent/ToastTitle/
 * ToastDescription/ToastAction/ToastClose` — minus the portal, seeds it
 * with real toasts (`toast.add(...)` calls lifted from
 * `src/app/calendar/CalendarView.tsx`), and pins the viewport and the
 * toast stack in flow with inline styles so the real toast chrome
 * (rounded-2xl popover surface, border, shadow, icon, action, close) is
 * visible in place.
 *
 * `ToastContent` is also pinned to `opacity: 1`: behind a collapsed stack
 * the DS fades every non-frontmost toast out (`data-behind:opacity-0`),
 * which in a still frame reads as two empty shells rather than a stack.
 *
 * Out of scope for a static render: the enter/exit transitions, the
 * collapsed-stack peek and the swipe-to-dismiss states, all of which are
 * driven by runtime CSS variables (`--toast-index`, `--toast-height`,
 * `--toast-offset-y`) that only exist while the viewport is live.
 */

type Seed = {
  title: string;
  description?: string;
  type?: string;
  actionProps?: { children: React.ReactNode };
};

const viewportStyle: React.CSSProperties = {
  position: "relative",
  inset: "auto",
  margin: 0,
  width: 380,
  maxWidth: "none",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  pointerEvents: "auto",
};

const toastStyle: React.CSSProperties = {
  position: "relative",
  right: "auto",
  bottom: "auto",
  transform: "none",
  height: "auto",
  opacity: 1,
  width: "100%",
};

function List() {
  const { toasts } = useToastManager();
  return (
    <>
      {toasts.map((item) => (
        <Toast key={item.id} toast={item} style={toastStyle} swipeDirection={[]}>
          <ToastContent style={{ opacity: 1 }}>
            <ToastIcon type={item.type} />
            <div
              style={{
                display: "flex",
                minWidth: 0,
                flex: 1,
                flexDirection: "column",
                gap: 4,
              }}
            >
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction />
            <ToastClose />
          </ToastContent>
        </Toast>
      ))}
    </>
  );
}

// `ToastIcon` is exported from the DS, so cells use the real glyphs at the
// same 16px with the same semantic colours — no substitute.

function Stage({ seeds }: { seeds: Seed[] }) {
  return (
    <ToastProvider timeout={0} limit={5}>
      <Seeder seeds={seeds} />
      <ToastViewport style={viewportStyle}>
        <List />
      </ToastViewport>
    </ToastProvider>
  );
}

// `ToastProvider` subscribes to an external `createToastManager()` in its own
// effect, which runs *after* its children's effects — so a child that seeds
// through the external manager on mount is dropped. Seeding through the
// context store (`useToastManager().add`) writes straight to the store and
// works on the first pass.
function Seeder({ seeds }: { seeds: Seed[] }) {
  const { add } = useToastManager();
  const done = React.useRef(false);
  React.useEffect(() => {
    if (done.current) return;
    done.current = true;
    for (const seed of seeds) {
      add({ ...seed, timeout: 0 } as never);
    }
  }, [add, seeds]);
  return null;
}

export function Success() {
  return (
    <Stage
      seeds={[
        {
          title: "Post moved",
          description: "Saturday 12 Oct, 14:00",
          type: "success",
        },
      ]}
    />
  );
}

export function Problem() {
  return (
    <Stage
      seeds={[
        {
          title: "Unable to move this post",
          description: "X did not respond. Please try again.",
          type: "error",
          actionProps: { children: "Retry" },
        },
      ]}
    />
  );
}

export function HeadsUp() {
  return (
    <Stage
      seeds={[
        {
          title: "Cannot move this post",
          description:
            "Only scheduled posts and unscheduled drafts can be moved.",
          type: "warning",
        },
      ]}
    />
  );
}

export function Stack() {
  return (
    <Stage
      seeds={[
        {
          title: "Draft saved",
          description: "Autosaved a moment ago.",
          type: "success",
        },
        {
          title: "Instagram reconnected",
          description: "Scheduled posts will resume.",
          type: "success",
        },
        {
          title: "Unable to move this post",
          description: "Please try again.",
          type: "error",
          actionProps: { children: "Retry" },
        },
      ]}
    />
  );
}
