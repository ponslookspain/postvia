import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "postvia";

/**
 * Drawer previews. The composer opens a bottom drawer for the post preview
 * sheet (NewPostComposer) — that is the `direction="bottom"` cell. The other
 * two exercise the documented axes: side direction and the `variant` /
 * `handle` pair. Every cell is `open` with no `onOpenChange` so vaul renders
 * the panel in a static capture; scaffolding uses inline styles.
 */

export function PreviewSheet() {
  return (
    <Drawer open direction="bottom">
      <DrawerContent style={{ maxHeight: "85vh" }}>
        <DrawerHeader>
          <DrawerTitle>Preview</DrawerTitle>
          <DrawerDescription>
            How this post will look once it is published to each channel.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <p style={{ fontSize: 14, lineHeight: "20px" }}>
            Shipping the new scheduling view today. One composer, every
            channel, and a calendar that finally tells you what is going out
            next.
          </p>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Badge variant="soft" color="primary">
              Instagram
            </Badge>
            <Badge variant="soft" color="info">
              Threads
            </Badge>
            <Badge variant="soft" color="neutral">
              X
            </Badge>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="outline">Back to editing</Button>
          <Button>Schedule post</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function PostDetailsPanel() {
  return (
    <Drawer open direction="right">
      <DrawerContent style={{ width: 380 }}>
        <DrawerHeader>
          <DrawerTitle>Post details</DrawerTitle>
          <DrawerDescription>
            Scheduled for Wednesday 15 May, 09:00.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar size="36">
              <AvatarFallback>PV</AvatarFallback>
            </Avatar>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500 }}>
                @postvia.studio
              </p>
              <p style={{ fontSize: 13, lineHeight: "18px", opacity: 0.66 }}>
                Instagram · Reel
              </p>
            </div>
          </div>
          <p style={{ fontSize: 14, lineHeight: "20px", marginTop: 16 }}>
            Three drafts are queued behind this one. Publishing early moves the
            rest of the week forward by an hour.
          </p>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost">Duplicate</Button>
          <Button>Publish now</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function FloatWithHandle() {
  return (
    <Drawer open direction="right" variant="float" handle backdrop="blur">
      <DrawerContent style={{ width: 340 }}>
        <DrawerHeader>
          <DrawerTitle>Filters</DrawerTitle>
          <DrawerDescription>
            Narrow the queue down to a single channel or status.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Badge variant="outline">Scheduled · 12</Badge>
            <Badge variant="outline">Drafts · 5</Badge>
            <Badge variant="outline">Failed · 1</Badge>
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button variant="ghost">Reset</Button>
          <Button>Apply</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
