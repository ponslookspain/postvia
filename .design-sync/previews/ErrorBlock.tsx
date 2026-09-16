import { Button, ErrorBlock } from "postvia";

/**
 * ErrorBlock previews. The block is an error-tinted outline alert that
 * explains what happened and how to fix it — never a readout. Copy is
 * lifted from the routes that ship it: posts/error.tsx, the accounts
 * connect flow, the composer's media upload and the calendar.
 */

const caption: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 12,
  lineHeight: "16px",
  color: "var(--color-muted-foreground)",
};

export function LoadFailed() {
  return (
    <ErrorBlock
      title="Posts failed to load"
      description="Please try again. Your drafts are kept."
    />
  );
}

export function WithAction() {
  return (
    <div>
      <p style={caption}>
        The action sits inside the description block, one line below it —
        the fix travels with the explanation.
      </p>
      <ErrorBlock
        title="Connection issue"
        description="Instagram disconnected when the password changed. Reconnect to keep publishing there."
        action={
          <Button variant="outline" size="sm">
            Reconnect Instagram
          </Button>
        }
      />
    </div>
  );
}

export function PublishFailure() {
  return (
    <ErrorBlock
      title="Weekly roundup didn't go out"
      description="TikTok rejected the post because the video is longer than 10 minutes. Trim it and schedule again."
      action={
        <Button variant="outline" size="sm">
          Open the post
        </Button>
      }
    />
  );
}

export function InlineNotice() {
  return (
    <div>
      <p style={caption}>
        Inline inside the composer, beside the media it refers to — short
        title, one sentence, no action.
      </p>
      <ErrorBlock
        title="Media upload"
        description="launch-teaser.mov is 82 MB. Files over 50 MB can't be uploaded."
      />
    </div>
  );
}
