import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "postvia";

/**
 * Card previews. Card is the block primitive: `rounded-2xl`, `bg-panel`, no
 * outline — blocks are separated by tone, not by a drawn box
 * (docs/design-system.md, "Surfaces"). The header/title/description/action/
 * content/footer composition and the `size="sm"` padding rule are both taken
 * from the app's own dashboard and billing blocks.
 */

export function Default() {
  return (
    <Card className="w-[420px]">
      <CardHeader>
        <CardTitle>Next up</CardTitle>
        <CardDescription>
          Tomorrow at 09:00 — the first of three posts lined up this week.
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            Edit
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-prose leading-snug">
          Shipping the new scheduling view today. One composer, every channel,
          and a calendar that finally tells you what is going out next.
        </p>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Publish now</Button>
        <Button variant="ghost" size="sm">
          Reschedule
        </Button>
      </CardFooter>
    </Card>
  );
}

export function Small() {
  return (
    <Card size="sm" className="w-[320px]">
      <CardHeader>
        <CardTitle>Your plan</CardTitle>
        <CardAction>
          <Badge variant="outline">Pro</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Unlimited posts across 4 connected channels. Renews 12 October.
        </p>
      </CardContent>
    </Card>
  );
}

export function ContentOnly() {
  return (
    <Card className="w-[320px]">
      <CardContent>
        <p className="text-sm text-muted-foreground">Posts this month</p>
        <p className="mt-1 font-heading text-2xl leading-8 font-semibold tracking-tight tabular-nums">
          24
        </p>
      </CardContent>
    </Card>
  );
}

export function Outlined() {
  return (
    <Card className="w-[320px] border-primary/40">
      <CardHeader>
        <CardTitle>Creator</CardTitle>
        <CardDescription>
          An outline is an accent, not a default — here it marks the
          highlighted plan.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button size="sm" className="w-full">
          Choose Creator
        </Button>
      </CardFooter>
    </Card>
  );
}
