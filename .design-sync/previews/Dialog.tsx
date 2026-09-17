import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Badge,
  Avatar,
  AvatarFallback,
} from "postvia";
import { CalendarClockIcon, TriangleAlertIcon } from "lucide-react";

/**
 * Dialog previews, ported from the app's own modals: the composer's
 * "Schedule post" editor (ScheduleDialog) and the row-menu delete confirm
 * (PostRowMenu). Every cell renders `open` with no `onOpenChange` so the
 * overlay is visible in a static capture. Wrapper/scaffolding elements use
 * inline styles — Tailwind utilities that appear only here are not in the
 * compiled stylesheet.
 */

export function SchedulePost() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule post</DialogTitle>
          <DialogDescription>
            One scheduled time for the whole post — it applies to all selected
            platforms, which publish together. Times use Europe/Madrid.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CalendarClockIcon
              aria-hidden="true"
              style={{ width: 20, height: 20, opacity: 0.6 }}
            />
            <div>
              <p style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
                Wednesday 15 May, 09:00
              </p>
              <p style={{ fontSize: 13, lineHeight: "18px", opacity: 0.66 }}>
                Goes out to Instagram, Threads and X at the same moment.
              </p>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost">Cancel</Button>
          <Button>Confirm schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDelete() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this post?</DialogTitle>
          <DialogDescription>
            The scheduled post for Thursday 09:00 will be removed from the
            calendar. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost">Keep post</Button>
          <Button variant="destructive">
            <TriangleAlertIcon data-icon="inline-start" aria-hidden="true" />
            Delete post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ChannelDetails() {
  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connected account</DialogTitle>
          <DialogDescription>
            PostVIA publishes to this account on your behalf.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar size="40">
              <AvatarFallback>PV</AvatarFallback>
            </Avatar>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
                @postvia.studio
              </p>
              <p style={{ fontSize: 13, lineHeight: "18px", opacity: 0.66 }}>
                Instagram · reconnected 3 days ago
              </p>
            </div>
            <Badge variant="soft" color="primary">
              Connected
            </Badge>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline">Reconnect</Button>
          <Button>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
