# Building with PostVIA

PostVIA is a social-media scheduling product. Components are React + Tailwind v4,
styled entirely by utility classes over a semantic token layer. **No provider is
required** — import a component and it is styled. Three exceptions, and only
these: `Sidebar*` parts need a `SidebarProvider` ancestor, `Toast*` parts need
`ToastProvider`, and `Tooltip`/`Popover`/`Dialog`/`DropdownMenu`/`Select` bring
their own roots.

## Two size APIs are live at once — this is the trap

`Button` uses the **PostVIA** API. Everything else uses a **numeric**
scale. Crossing them drops every size class *silently* — `cva` finds
no match, and `defaultVariants` only fills a prop that is `undefined`, not one
set to an unknown value. Nothing errors; the component just renders at its base
size.

```tsx
<Button variant="secondary" size="sm">Save draft</Button>   // ✅ PostVIA
<Input size="32" />                                         // ✅ numeric
<Button size="32">…</Button>                                // ❌ silently unsized
<Input size="sm" />                                         // ❌ silently unsized
```

- `Button` — `variant: default | secondary | outline | ghost | destructive | link`,
  `size: default | sm | lg | icon-sm`
- `Input`, `SelectTrigger`, `Avatar` — `size="28|32|36|40|44|48"` (subsets vary)
- `Badge` — `size="20|24"`
- `Switch` — `"20|24|32"` · `Checkbox`, `RadioGroup` — `sm|md|lg` · `TextArea` — no size axis
- `SidebarMenuButton` — `"28|32|36|48|52|56"`

Read the component's `.d.ts` before passing a size. It is authoritative.

## The styling idiom: semantic tokens, never raw colour

Use these utility families. They are the canonical PostVIA layer and both themes
are defined for every one.

| Family | Utilities | Means |
|---|---|---|
| Background | `bg-background` | the page canvas |
| Panel | `bg-panel` | a block on the page — **no outline** |
| Surface | `bg-card`, `bg-popover` | raised block; floating UI |
| Foreground | `text-foreground`, `text-muted-foreground` | ink; metadata |
| Muted | `bg-muted` | neutral fill, hovers, inset wells |
| Border | `border-border`, `border-input`, `ring-ring` | hairline; field edge; focus ring |
| Primary | `bg-primary`, `text-primary-foreground` | the one brand hue (PostVIA Blue) |
| Status | `bg-success`, `bg-warning`, `bg-error`, `bg-info` | dots and badges only |

Never write a hex, a Tailwind palette colour (`bg-red-500`), or `bg-white` /
`text-black`. There is no Radian alias layer any more (`bg-bg`, `bg-fill1`,
`text-fg` and friends were removed) — every primitive uses the table above
directly, and so should anything you build.

Type: `font-sans` (Inter) is the default; `font-heading` (DM Sans) for headings;
`font-mono` (Geist Mono). Page title `text-2xl leading-8 font-semibold
tracking-tight`, section title `text-lg leading-7 font-medium`, body `text-sm`,
metadata `text-xs`. Four half-steps exist for the in-between sizes:
`text-micro` (10px), `text-meta` (11px), `text-label` (13px), `text-prose` (15px).

## Non-negotiable rules

1. **Blocks are separated by tone, not by a drawn box.** A block is `bg-panel`
   with no border class. `Card` does this already. A block *nested* inside one
   goes the other way — `bg-background` — so it reads as inset. An outline is an
   accent, legitimate only to mark something out (the highlighted plan, an
   invalid field).
2. **Buttons are always fully rounded pills.** Never pass `h-*`, `min-h-*`,
   padding, or a radius to a `Button`; the size variants own all of it. Icons use
   `data-icon="inline-start|inline-end"` and carry no sizing classes.
3. **Status hues live in dots and badges only**, never as page decoration. Use
   `StatusBadge` / `StatusDot` with a status string (`DRAFT`, `SCHEDULED`,
   `PUBLISHING`, `PUBLISHED`, `PARTIALLY_PUBLISHED`, `FAILED`). `SCHEDULED` is
   a quiet **info-blue status tint** — a routine future-dated post must not
   read as an alert surface.
4. **Navigation stays tonal.** The active nav pill is a quiet neutral fill
   (`sidebar-accent`); the single blue (`sidebar-primary` / `primary`) is
   for primary actions, links, selected tabs, focus and CTAs.
5. **Use `PlatformIcon` for X, Threads, TikTok and Instagram.** `lucide-react`
   ships no brand icons, and importing `InstagramIcon` is a hard build error.
6. **Dark is the product default**, light is opt-in. Both themes are complete.
   Apply `class="dark"` to `<html>` (or any wrapper — the variant is
   `&:is(.dark *)`) to render the product's real default appearance.

## Composition

Forms are `FieldGroup > Field > FieldLabel + control`. Validation is
`data-invalid` on the `Field` **and** `aria-invalid` on the control — never a
colour class on the label. Alerts are
`Alert > AlertIcon + AlertContent > AlertTitle + AlertDescription`; omitting
`AlertContent` lays title and description side by side, because `Alert`'s root
is a flex row.

## Where the truth is

Read `_ds/<folder>/styles.css` and the `_ds_bundle.css` it imports for the real
token values, `guidelines/docs/design-system.md` for the rules above in full
(surfaces, list rows, voice), `guidelines/docs/design-tokens.md` for the token
inventory and both-theme values, and each component's `<Name>.prompt.md` and
`<Name>.d.ts` for its API. Prefer reading those files over guessing.

```tsx
<Card className="w-full">
  <CardHeader>
    <CardTitle>Next up</CardTitle>
    <CardDescription>Tomorrow at 09:00 — first of three this week.</CardDescription>
    <CardAction><Button variant="outline" size="sm">Edit</Button></CardAction>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-2">
      <StatusBadge status="SCHEDULED" />
      <span className="text-meta text-muted-foreground tabular-nums">09:00</span>
    </div>
  </CardContent>
</Card>
```
