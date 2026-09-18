import {
  Banner,
  BannerContent,
  BannerDescription,
  BannerIcon,
  BannerTitle,
  Button,
} from "postvia";
import { SparklesIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";

/**
 * Banner previews. A banner is the page-width notice that sits above the
 * content, so every cell renders it full-bleed inside a fixed-width stage
 * rather than as a floating box. Same two weights as Alert
 * (docs/design-system.md): a **problem** carries the error tint, a
 * **heads-up** the warning tint, and the heads-up never borrows the
 * failure colours.
 */

const stage: React.CSSProperties = {
  width: 560,
  borderRadius: 12,
  overflow: "hidden",
};

export function Problem() {
  return (
    <div style={stage}>
      <Banner color="error" variant="soft" onClose={() => {}}>
        <BannerIcon>
          <TriangleAlertIcon style={{ width: 16, height: 16 }} />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>2 posts failed to publish</BannerTitle>
          <BannerDescription>
            X rejected both for a media type it does not accept.
          </BannerDescription>
        </BannerContent>
        <Button variant="outline" size="sm">
          Review
        </Button>
      </Banner>
    </div>
  );
}

export function HeadsUp() {
  return (
    <div style={stage}>
      <Banner color="warning" variant="soft" onClose={() => {}}>
        <BannerIcon>
          <SparklesIcon style={{ width: 16, height: 16 }} />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>You have used 18 of 20 posts this month</BannerTitle>
          <BannerDescription>
            Your allowance resets on 1 October.
          </BannerDescription>
        </BannerContent>
        <Button variant="outline" size="sm">
          Upgrade
        </Button>
      </Banner>
    </div>
  );
}

export function Announcement() {
  return (
    <div style={stage}>
      <Banner color="primary" variant="strong" onClose={() => {}}>
        <BannerTitle>
          The new calendar is live — drag a draft onto any day to schedule it.
        </BannerTitle>
      </Banner>
    </div>
  );
}

export function Outline() {
  return (
    <div style={stage}>
      <Banner color="neutral" variant="outline">
        <BannerIcon>
          <WifiOffIcon style={{ width: 16, height: 16 }} />
        </BannerIcon>
        <BannerContent>
          <BannerTitle>You are offline</BannerTitle>
          <BannerDescription>
            Drafts are saved locally and will sync when you reconnect.
          </BannerDescription>
        </BannerContent>
      </Banner>
    </div>
  );
}
