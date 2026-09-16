import {
  Alert,
  AlertContent,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  AlertToolbar,
  Button,
} from "postvia";
import { InfoIcon, PlugZapIcon, TriangleAlertIcon } from "lucide-react";

/**
 * Alert previews. An alert is an in-page notice that belongs to a block.
 * docs/design-system.md gives notices exactly two weights: a **problem**
 * (something broke — error tint) and a **heads-up** (worth knowing —
 * warning tint); a heads-up must never wear the failure colours. The
 * `color="error" variant="outline"` + bare lucide icon composition is
 * ported verbatim from `src/app/login/LoginForm.tsx`, and the neutral
 * outline one from `src/app/accounts/AccountsContent.tsx`.
 */

const row: React.CSSProperties = { width: 420 };

export function Problem() {
  return (
    <div style={row}>
      <Alert color="error" variant="outline">
        <AlertIcon>
          <TriangleAlertIcon />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>
            Google sign-in failed. Please try again.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}

export function HeadsUp() {
  return (
    <div style={row}>
      <Alert color="warning" variant="soft">
        <AlertIcon>
          <PlugZapIcon />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Instagram needs reconnecting</AlertTitle>
          <AlertDescription>
            Its access token expires on Friday. Posts scheduled after that
            will not go out until you reconnect.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}

export function Neutral() {
  return (
    <div style={row}>
      <Alert color="neutral" variant="outline">
        <AlertContent>
          <AlertTitle>Accounts</AlertTitle>
          <AlertDescription>
            Threads disconnected. Anything scheduled for it has been moved to
            drafts.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}

export function WithToolbar() {
  return (
    <div style={row}>
      <Alert color="error" variant="soft-outline" close>
        <AlertIcon>
          <TriangleAlertIcon />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>2 posts failed to publish</AlertTitle>
          <AlertDescription>
            X rejected both for a media type it does not accept.
          </AlertDescription>
          <AlertToolbar style={{ marginTop: 8 }}>
            <Button variant="outline" size="sm">
              Review and retry
            </Button>
          </AlertToolbar>
        </AlertContent>
      </Alert>
    </div>
  );
}

export function Informational() {
  return (
    <div style={row}>
      <Alert color="info" variant="soft">
        <AlertIcon>
          <InfoIcon />
        </AlertIcon>
        <AlertContent>
          <AlertTitle>Scheduled for Saturday at 14:00</AlertTitle>
          <AlertDescription>
            Info blue, not the brand hue — a routine future-dated post must
            not read as an alert.
          </AlertDescription>
        </AlertContent>
      </Alert>
    </div>
  );
}
