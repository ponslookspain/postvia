import {
  Avatar,
  AvatarFallback,
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "postvia";
import { InfoIcon, SendIcon } from "lucide-react";

/**
 * Tooltip previews. The composer's channel strip (ChannelStrip) labels each
 * account avatar with the default (inverse) tooltip — that is the first cell.
 * The remaining cells cover the two other axes the component exposes:
 * `theme="light"` and `withArrow`. Each cell is `open` with no
 * `onOpenChange` so the content renders in a static capture.
 */

export function ChannelLabel() {
  return (
    <div
      style={{
        padding: 64,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Tooltip open>
        <TooltipTrigger asChild>
          <Avatar size="40">
            <AvatarFallback>PV</AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>Instagram @postvia.studio · Customized</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function LightTheme() {
  return (
    <div
      style={{
        padding: 64,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Why is this locked?">
            <InfoIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent theme="light">
          TikTok needs a privacy level before this post can be scheduled.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function WithArrow() {
  return (
    <div
      style={{
        padding: 64,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Tooltip open>
        <TooltipTrigger asChild>
          <Button>
            <SendIcon data-icon="inline-start" aria-hidden="true" />
            Publish now
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" withArrow>
          Publishes to all three selected channels immediately.
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
