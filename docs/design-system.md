# Postvia Design System

Source of truth for the **implemented** visual language. No roadmaps,
no proposals — only what the code does today.

Companion document: [`design-tokens.md`](design-tokens.md) — the token
inventory, the legacy-API mapping and the list of known gaps. This file is
the *rules*; that one is the *parts*.

## Canonical layer

The design system is two files, imported in dependency order from
`src/app/globals.css`:

```
src/app/design-system/foundations.css      1. raw scales
src/app/design-system/semantic.css         2. CANONICAL PostVIA tokens
```

`semantic.css` is the source of truth: background, surface, panel,
foreground, muted, border, primary, success, warning, error, info,
navigation, in both themes. Every component and page consumes these names
directly (`bg-panel`, `text-muted-foreground`, `border-error`, …) — there is
no alias layer between them. There used to be a third file,
`compat-radian.css`, translating those names into Radian's own vocabulary
(`bg`, `fill1`-`fill4`, the `fg` ramp, `<family>-fg`…) so the RadianUI-
generated primitives in `src/components/ui` could keep their original
classnames; it has been removed now that every call site was migrated onto
the canonical names (see `docs/design-tokens.md`, "Radian removal", for the
full before/after mapping).

## Base

- **Radian UI** (`default` style) originally generated the primitives'
  structure, Tailwind v4 supplies styling, Radix UI (`@radix-ui/react-*`)
  supplies accessibility behaviour, Lucide supplies icons, `cn()` handles
  conditional classes.
- Primitives live in `src/components/ui`, PostVIA custom components
  (`Field`, `Toast`, avatar extensions) beside them. There is no
  `components.json` any more — it was the RadianUI generator's config,
  dead weight once nothing in the repo runs that generator.

## Color philosophy

- **Dark is the default theme**, light is opt-in. Both are first-class:
  the `dark` class is set on `<html>` by a blocking script before first
  paint (`src/hooks/use-theme.ts`), the choice persists in
  `localStorage`, and it is switched from Appearance in the account menu.
- Warm paper canvas in light (`--background` #F5F4EE), warm charcoal in
  dark (`--background` #262624). Surfaces split by tone, hairline borders
  only (#E3E2DE / #34332F). No gradients, no glow, no heavy shadows.
- **One brand hue:** PostVIA Blue (`--primary`, light #2971C6 / dark
  #5FA1F3), reserved for primary actions, active navigation, selected
  tabs, links, focus states and main CTAs. Red is reserved for
  error/destructive only.
- The scheduled state uses **info blue** (same hue as brand): a routine
  future-dated post is a quiet status tint, never a full alert surface.
- Semantic colors only where they mean something: destructive,
  success/warning status dots, per-platform glyph accents (Instagram).

## Surfaces

- **Blocks are separated by tone, not by a drawn box.** A tile sits on
  `--panel`, one shade off the page, and carries no outline. `Card` does
  this by default; hand-rolled tiles use `bg-panel` and no border class.
- **A block nested inside a tile goes the other way** — `bg-bg`, so it
  reads as inset instead of vanishing into an identically toned panel.
- An outline is an accent, not a default: it is legitimate only when it
  marks something out (the highlighted plan, an aria-invalid field). The
  `Card` border is `border-transparent`, so a caller can still opt into
  one without the geometry shifting.
- The default border color belongs to `@layer base`. Never restate it as
  an unlayered `* { border-color }` rule — unlayered styles outrank every
  Tailwind layer and silently disable all `border-*` color utilities.

## List rows

- A clickable row is a **rounded surface**, never a full-bleed band. It
  spans exactly the block's content width, so the gap from the highlight
  to the block edge is the same on the left, the right and the bottom,
  and the highlight lines up with the rule above it.
- The row carries its own padding, which indents its text slightly from
  the block title. That is the same relationship the `Next up` block
  uses; aligning the text instead would push the highlight past the
  block's padding and break the even gap.
- Hover is `bg-fill1-alpha` — a 4% lift. It must stay clearly below the
  tone of any thumbnail or icon tile inside the row, otherwise hovering
  reads as the row lighting up rather than being pointed at.
- **Rows are separated by spacing, not hairlines.** A hairline and a
  hover highlight compete for the same gap; pick the highlight. Keep
  hairlines only for structural splits (header from list, filter from
  results), inset to the block's content padding so every rule on the
  page lines up.
- Row content is vertically centered (`items-center`) — thumbnail, text
  and the trailing affordance share one axis.
- No decorative placeholders. An empty slot where a thumbnail would go
  stays empty; a dot that stands in for missing media says nothing and
  reads as a status the row does not have.

## Typography

- Body **Inter** (`--font-sans`), headings **DM Sans**
  (`--font-heading`), monospace **Geist Mono** (`--font-mono`) — declared
  and available, not yet used by any call site.
- Scale: page titles large/semibold, section titles medium, body
  14–15px relaxed, metadata 12–13px muted. Left-aligned, sentence
  case, no decorative serif, no single-word accent coloring.

## Radius

- Base `--radius: 0.875rem`. Cards `rounded-2xl`, inner content
  `rounded-xl`, small controls `rounded-lg/md`, **buttons always
  fully rounded pills** (PostVIA geometry, preserved through migration).
- Never add arbitrary radius values.

## Buttons (rule)

- Use the `Button` API exactly as installed: `default / outline /
  secondary / ghost / destructive / link`, sizes `default / xs / sm /
  lg`, icon sizes `icon / icon-xs / icon-sm / icon-lg` (Radian
  implementation underneath, PostVIA-compatible props on top).
- **No separate button sizing system.** Do not add `size` props,
  `h-*`/`min-h-*`, paddings or radii to individual buttons to make
  them match each other; do not add global button CSS.
- Icons inside buttons use `data-icon="inline-start|inline-end"` with
  no sizing classes. Async actions compose `Spinner + data-icon +
  disabled` (there is no `isLoading` prop).

## Inputs / forms

- `FieldGroup + Field + FieldLabel`, validation via `data-invalid` on
   the `Field` and `aria-invalid` on the control. Native date/time
    inputs keep their functional borders. Filter collections use the
    Radian `Tabs` primitive (`ui/tabs.tsx`, URL-driven links), not
   hand-rolled strips; plain underline treatments remain for inline
   text links only.

## Cards

- `Card` is the block primitive: `rounded-2xl`, `bg-panel`, no outline,
  with header/title/description/action/content/footer composition.
- Its `size="sm"` padding rule (`data-[size=sm]:…px-4`) outranks a
  `px-0` passed by a caller, so content inside a card is always inset by
  the card padding. Align rules and rows to that inset rather than
  fighting it — that is what keeps every divider on a page in one line.
- No shadows except true floating UI (popover/dialog/drawer/toast).
  Gradients and decorative borders are out.

## Navigation / sidebar

- Radian sidebar primitive (`ui/sidebar.tsx`, `ui/tooltip.tsx`,
  `ui/drawer.tsx`, `hooks/use-mobile.ts`): `SidebarProvider`,
  icon-collapsible rail (`16rem` / `3rem`), tooltips in collapsed mode,
  keyboard toggle, mobile Drawer.
- `variant="inset"` + `theme="gray"`: the rail is a shade off the page
  and the content sits on it as a rounded panel, so the two are told
  apart by tone rather than by a divider.
- Nav items are **pills** (`rounded-full`); the active one is a quiet
  neutral fill, never the brand hue — the red is for actions.
- Collapsed geometry is arithmetic, not eyeballing: the rail is `3rem`
  and a nav button is `size-8`, so the group padding must be `px-2` for
  the icons to sit centered. Same for the header, where the wordmark is
  dropped entirely and only the toggle remains.
- The footer is one account trigger opening a `DropdownMenu`: profile,
  Appearance (light/dark), Settings, Billing, legal links, sign out.
  Settings and Billing live there, not in the primary nav
  (`accountMenuItems` in `nav-items.ts`, shared with `MobileTopBar`).

## Dialogs / popovers / sheets

- Used for confirmations (delete, schedule), overflow lists (`+N
  more`), pickers and mobile navigation. Always with a `Title` (a11y),
  existing focus/dismiss behavior, no custom chrome.

## Calendar / date picker

- Month timetable grid (fixed geometry, drag-to-reschedule, overflow
  popover, dots on mobile, drafts rail). Scheduling date uses the
  Radian `Calendar` in a `Popover` (`ui/calendar.tsx`,
  `ScheduleDatePicker.tsx`); time stays a native time input.
  `react-day-picker` + `date-fns` are the only UI-adjacent runtime
  dependencies and belong to that component.

## Spacing / responsive

- Large gaps between major sections, medium between groups, tight
  inside controls. Content never touches container edges.
- Mobile gets its own hierarchy (stacked sections, fixed composer
  action bar, drawer navigation) — never a squeezed desktop layout.

## Accessibility (as implemented)

- `focus-visible` rings, semantic landmarks (`nav`/`main`/headings),
  `aria-label`/`aria-current`/`aria-selected`/`aria-expanded` where
  state exists, `role=status` for async feedback, `sr-only` fallbacks,
  `prefers-reduced-motion` respected, decorative motion avoided.

## Screen notes (actual)

- **Dashboard:** greeting + **one sentence** about the month's rhythm
  and a single primary CTA — no KPI tile wall. Then, in order of what
  can be acted on: anything that failed, alerts that have no block of
  their own, `Next up` (the focal block: countdown, time, channel and
  the post itself), recent posts, channels, a quiet plan row. Charts
  live last and only appear once there are at least three posts —
  twelve empty bars are ceremony, not insight. First run keeps the
  minimal two-step block.
- **Composer:** dominant borderless editor, channels → media →
  schedule utility, sticky rail (borderless preview mock, single
  publish `Card`), one schedule dialog (no duplicate date/time entry),
  fixed mobile action bar.
- **Posts:** segmented `Tabs` status filter (URL-driven links),
  unified search/platform/sort toolbar, hairline content rows with platform/status/date columns on
  desktop and stacked meta on mobile, row menu (view/edit/retry/delete
  + confirm dialog).
- **Calendar:** light timetable, icon-only month nav + outline Today,
  wash chips with status/time/caption, drafts rail, plan gating.
- **Auth:** centered `AuthShell` (`max-w-sm`, wordmark, title,
  description), `FieldSeparator` OAuth divider, centered code input;
  all flows/gating/copy preserved (see `docs/auth-ui.md`).

## Voice

- Write sentences, not readouts. "Nothing has gone out this month yet —
  1 post is lined up" beats a row of counters that includes four zeros.
- Say a thing once per page. If a block already states the next post's
  time, the page header must not repeat it, and an alert must not
  duplicate a list that is visible right above it.
- Time is spoken the way a person says it: "tomorrow at 09:00",
  "Saturday at 14:00", "in 2 weeks" — not a bare timestamp
  (`formatTimeUntil` in `lib/dashboard-analytics.ts`).
- Labels name the thing, not the system: "Your channels / Where your
  posts go", not "Platforms and accounts / Publish totals, success rate
  and connection state per platform".
- Two weights for notices: a **problem** (something broke, error tint)
  and a **heads-up** (worth knowing, warning tint). A heads-up must
  never wear the failure colors.
- Don't show a chart, a percentage or a metric that has no data behind
  it yet; hide the block instead.

## Hard rules

1. No new global design tokens without necessity — extend the canonical
   layer (`src/app/design-system/semantic.css`) instead of forking it.
   A new value goes there; a new alias goes nowhere.
2. No second button sizing system, ever.
3. No Magic UI / decorative animation libraries.
4. No raw status/brand hex values in components — semantic tokens or
   documented platform accents only.
5. Compose from installed primitives; verify with `lint` +
   `typecheck` before every commit.
6. Never restate a base style as an unlayered CSS rule — it outranks
   every Tailwind utility and disables the class silently.
7. Blocks get no outline; separation is tone and spacing.
