# Postvia Design System

Source of truth for the **implemented** visual language. No roadmaps,
no proposals — only what the code does today.

## Base

- **shadcn/ui, `base-maia` style** (preset `b2M7vIBmaW`), Tailwind v4,
  Base UI primitives, Lucide icons, `cn()` for conditional classes.
- `components.json` pins the style; do not hand-edit generated
  primitives — change them only through the shadcn CLI.

## Color philosophy

- White canvas (`--background`), near-black text, neutral gray muted
  surfaces. No cream, no warm tints, no gradients, no glow.
- **One brand hue:** indigo primary (`--primary`,
  light `oklch(0.488 0.243 264.376)`), reserved for primary actions
  and the scheduled state. Everything else stays monochrome.
- Semantic colors only where they mean something: destructive,
  success/warning status dots, per-platform glyph accents (Instagram).
- Dark mode exists and compiles; light mode is the primary reference.

## Typography

- Body **Inter** (`--font-sans`), headings **DM Sans**
  (`--font-heading`); Geist variables retained but not primary.
- Scale: page titles large/semibold, section titles medium, body
  14–15px relaxed, metadata 12–13px muted. Left-aligned, sentence
  case, no decorative serif, no single-word accent coloring.

## Radius

- Base `--radius: 0.875rem`. Cards `rounded-2xl`, inner content
  `rounded-xl`, small controls `rounded-lg/md`, **buttons always
  fully rounded pills** (preset geometry).
- Never add arbitrary radius values.

## Buttons (rule)

- Use the Maia `Button` API exactly as installed: `default / outline /
  secondary / ghost / destructive / link`, sizes `default / xs / sm /
  lg`, icon sizes `icon / icon-xs / icon-sm / icon-lg`.
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
   Maia `Tabs` primitive (`ui/tabs.tsx`, URL-driven links), not
   hand-rolled strips; plain underline treatments remain for inline
   text links only.

## Cards / surfaces

- `Card` is a white bordered `rounded-2xl` discrete object
  (header/title/description/content/footer composition). It is **not**
  the default layout primitive: major areas are canvas sections
  separated by whitespace; lists use hairline `divide-y` rows.
- No shadows except true floating UI (popover/dialog/sheet/toast).
- Shadows, gradients and decorative borders are out.

## Navigation / sidebar

- Official shadcn sidebar primitive (`ui/sidebar.tsx`,
  `ui/tooltip.tsx`, `ui/sheet.tsx`, `hooks/use-mobile.ts`):
  `SidebarProvider`, icon-collapsible rail (`16rem` / `3rem`), tooltips
  in collapsed mode, keyboard toggle, mobile Sheet.
- App content (`Sidebar`, `MobileTopBar`, `nav-items.ts`) is Postvia's
  own: flat routes, `aria-current`, avatar + sign-out + plan upsell.
  No `inset` variant, no demo nav data.

## Dialogs / popovers / sheets

- Used for confirmations (delete, schedule), overflow lists (`+N
  more`), pickers and mobile navigation. Always with a `Title` (a11y),
  existing focus/dismiss behavior, no custom chrome.

## Calendar / date picker

- Month timetable grid (fixed geometry, drag-to-reschedule, overflow
  popover, dots on mobile, drafts rail). Scheduling date uses the
  shadcn `Calendar` in a `Popover` (`ui/calendar.tsx`,
  `ScheduleDatePicker.tsx`); time stays a native time input.
  `react-day-picker` + `date-fns` are the only UI-adjacent runtime
  dependencies and belong to that component.

## Spacing / responsive

- Large gaps between major sections, medium between groups, tight
  inside controls. Content never touches container edges.
- Mobile gets its own hierarchy (stacked sections, fixed composer
  action bar, sheet navigation) — never a squeezed desktop layout.

## Accessibility (as implemented)

- `focus-visible` rings, semantic landmarks (`nav`/`main`/headings),
  `aria-label`/`aria-current`/`aria-selected`/`aria-expanded` where
  state exists, `role=status` for async feedback, `sr-only` fallbacks,
  `prefers-reduced-motion` respected, decorative motion avoided.

## Screen notes (actual)

- **Dashboard:** greeting header + single primary CTA, editorial stat
  strip, usage card, hairline post lists, quiet underline filter,
  plain accounts section, minimal first-run block.
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

## Hard rules

1. No new global design tokens without necessity — extend the Maia
   system instead of forking it.
2. No second button sizing system, ever.
3. No Magic UI / decorative animation libraries.
4. No raw status/brand hex values in components — semantic tokens or
   documented platform accents only.
5. Compose from installed primitives; verify with `lint` +
   `typecheck` before every commit.
