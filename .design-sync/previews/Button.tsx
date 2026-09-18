import { Button } from "postvia";
import { ArrowRightIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";

/**
 * Button previews. Props and composition are taken from the app's own call
 * sites (`src/app/**`) and the rules in docs/design-system.md: the direct
 * PostVIA variant/size contract (`default | secondary | outline | ghost |
 * destructive | link` × `default | sm | lg | icon-sm`), buttons are
 * always fully rounded pills, and icons are placed with
 * `data-icon="inline-start|inline-end"` and carry no sizing classes.
 */

const row = "flex flex-wrap items-center gap-3";

export function Variants() {
  return (
    <div className={row}>
      <Button>Schedule post</Button>
      <Button variant="secondary">Save draft</Button>
      <Button variant="outline">Cancel</Button>
      <Button variant="ghost">Preview</Button>
      <Button variant="destructive">Delete post</Button>
      <Button variant="link">View all scheduled</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div className={row}>
      <Button size="sm">Edit</Button>
      <Button size="default">Publish now</Button>
      <Button size="lg">Get started free</Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div className={row}>
      <Button>
        <PlusIcon data-icon="inline-start" />
        New post
      </Button>
      <Button variant="outline">
        <RotateCcwIcon data-icon="inline-start" />
        Retry failed
      </Button>
      <Button variant="link">
        See how it works
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
    </div>
  );
}

export function IconOnly() {
  return (
    <div className={row}>
      <Button size="icon-sm" variant="ghost" aria-label="Retry">
        <RotateCcwIcon />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label="Delete">
        <Trash2Icon />
      </Button>
      <Button size="icon-sm" aria-label="New post">
        <PlusIcon />
      </Button>
    </div>
  );
}

export function States() {
  return (
    <div className={row}>
      <Button loading>Publishing</Button>
      <Button variant="outline" loading>
        Checking channels
      </Button>
      <Button disabled>Publish now</Button>
      <Button variant="destructive" disabled>
        Delete post
      </Button>
    </div>
  );
}
