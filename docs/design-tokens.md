# PostVIA Design Tokens

The canonical token inventory. `docs/design-system.md` describes how the
product *uses* the system (rules, screen notes, voice); this file records
*what the system is made of* and where each name lives.

## Where the design system lives

```
src/app/globals.css                        entry: imports, dark variant, @layer base
src/app/design-system/foundations.css      1. Foundations   — raw scales
src/app/design-system/semantic.css         2. Semantic      — CANONICAL
src/app/layout.tsx                         font families (next/font)
src/components/ui/*                        components
src/components/*                           patterns and shells
```

**The canonical design system is `src/app/design-system/semantic.css`.**
`foundations.css` is its only input (raw colour/type/spacing primitives).
Every component and page consumes `semantic.css`'s names directly —
`bg-panel`, `text-muted-foreground`, `border-error`, and so on. A tool
reading this repository should treat `semantic.css` as the single token
source of truth; there is nothing downstream of it to also check.

Direction of truth:

```
foundations.css  →  semantic.css  →  components
                    ^^^^^^^^^^^^
                    canonical
```

### Radian removal

The primitives under `src/components/ui/` were originally scaffolded by the
RadianUI generator (`radianui.com`) and, until this cleanup, styled with
Radian's own token vocabulary (`bg-fill1`, `text-fg-secondary`,
`border-primary-focus`, …) via a `compat-radian.css` alias layer. That
layer has been **removed**: every call site — all `src/components/ui/*`
primitives and every product page that used the Radian names directly —
now writes PostVIA's canonical classes (`bg-muted`, `text-muted-foreground`,
`ring-ring`, …). The rename was purely mechanical: each Radian alias
resolved to one canonical value already, so every replacement is that same
value under its PostVIA name — no colour, spacing, or behaviour changed.
Four status sub-steps that only ever lived in the compat layer
(`success/warning/error/info` `-accent/-focus/-border/-hover`, plus
`info-text`) were promoted into `semantic.css` itself as first-class
canonical tokens, derived from the semantic hues via `color-mix`. Three
`-alpha` translucency steps became `--overlay-4/-8/-12`.

A second cleanup wave then removed the runtime surface the compat layer had
existed to serve: the `POSTVIA_VARIANT_MAP / POSTVIA_SIZE_MAP /
POSTVIA_SIZE_FIXES` Button indirection (now a direct cva contract with the
same class sets), the Badge 17-hue `color` axis and `28` size, the
`AvatarFallback` hues outside the four product ones, the
`SidebarMenuButton` `soft` / `strong` tones, and the `--signal`,
`--destructive`-token and `--secondary` aliases (all zero consumers). No
colour, spacing, or behaviour changed at any call site.

What's still "Radian" in this codebase, and is **not** part of this
removal: `@radix-ui/react-*` (Radix UI) is the headless accessibility
engine under `Dialog`, `Select`, `Tooltip`, `Popover`, `DropdownMenu`, etc.
— it has nothing to do with styling or naming and stays. The raw hue
palette in `foundations.css` (`red`, `emerald`, `amber`, `light-blue`,
plus `neutral`) is also unchanged in role: it's raw colour data backing
the `AvatarFallback` tints, not a naming convention components should
reach past `semantic.css` to touch.

## Exported to Claude Design

The design system is also synced to a Claude Design project, so the design
agent builds with these real components. The export surface is the hand-written
barrel `.design-sync/ds-entry.ts` — nothing in the app imports it, and it is
**not** derived from the directory listing.

**Adding a component to `src/components/ui/` does not add it to the sync.** Add
its module to `ds-entry.ts` and re-run `.design-sync/gen-component-docs.mjs`,
which throws if the new module has no group mapped. Operational detail,
gotchas and the re-sync command live in `.design-sync/NOTES.md`;
`.design-sync/conventions.md` is the usage guidance handed to the design agent.

Product-coupled modules (`AppShell`, the product `Sidebar`, `MobileTopBar`,
`landing/*`, `billing/*`) are deliberately excluded — they depend on
`next/navigation` or prisma-backed auth and are page content, not design system.

## Theming

`dark` is the product default; light is opt-in. The `dark` class is written
to `<html>` by a blocking script before first paint
(`src/hooks/use-theme.ts`), persisted in `localStorage`, and toggled from
Appearance in the account menu.

Because `.dark` sits on `<html>` — the same element as `:root` — a token
   declared as an alias (`--panel-foreground: var(--foreground)`) resolves against
   whichever value is in effect. Aliases are therefore declared once, in
`:root`, and `.dark` restates real values only.

Every canonical token is defined for both themes. Three status hues
(`--info`, and every `-foreground` ink) intentionally carry one value across
both themes because they stay legible on either canvas.

## 1. Foundations

| Group | Tokens | Notes |
| --- | --- | --- |
| Colors | 4-hue OKLCH palette (`--color-red`, `--color-emerald`, `--color-amber`, `--color-light-blue`), each with the two consumed steps `-accent` / `-text`, plus a full `.dark` re-map | Primitives. Components must not use them directly, except the `AvatarFallback` tint axis; `semantic.css` gives the four hues product names (`error`, `success`, `warning`, `info`). History: a 17-hue generator palette exposing `base / accent / focus / border / hover / text / fg`; every hue and step without a consumer was removed (see §3). |
| Typography | `--font-sans` (Inter, body), `--font-heading` (DM Sans), `--font-mono` (Geist Mono) | Families come from `next/font` in `layout.tsx`. Declared with `@theme inline` so the utility points at the next/font variable instead of self-referencing. |
| Typography | `--text-micro` 10px · `--text-meta` 11px · `--text-label` 13px · `--text-prose` 15px | The four half-steps Tailwind's ramp lacks. Font size only — line height stays at the call site. |
| Spacing | `--spacing` 0.25rem | Tailwind's base step, stated explicitly. |
| Spacing | `--page-narrow` 48rem · `--page-default` 64rem · `--page-wide` 76rem · `--section-gap` 2.5rem · `--measure-prose` 68ch | Consumed by `PageContainer`, `PageSections`, `PageHeader`, `SectionHeader`. |
| Radius | `--radius` 0.875rem, and `--radius-sm … --radius-4xl` derived from it | One base, everything else `calc()`. Buttons are always `rounded-full`. Never add an arbitrary radius at a call site. |
| Motion | Tailwind utilities at the call site (`duration-200`, `ease-linear`, …) | Decorative animation libraries are out. Custom keyframes (`post-in`, `how-progress`) live in `globals.css`; `prefers-reduced-motion` is honoured globally there. |

Surfaces, Borders and Elevation are tone decisions rather than raw scales,
so they live in the semantic layer.

### Tonal scales (Color System 2.0, Phase 1 — additive, no consumers)

Six PostVIA-owned tonal scales in `foundations.css`, reserved for the future
Phase 2 semantic mapping. Each scale follows the 1 → 12 progression
(1 whisper · 2 very subtle · 3 soft surface · 4 hover · 5 active ·
6 subtle border · 7 border · 8 strong border/input · 9 solid ·
10 solid hover · 11 accessible text · 12 strongest text).

| Scale | Hue family | Materialized steps | Intended Phase 2 consumers |
| --- | --- | --- | --- |
| `paper` | neutral / warm | 1, 2, 3, 6, 7, 8, 11, 12 | surfaces, borders, neutral text |
| `signal` | brand blue | 3, 7, 9, 11 | primary soft / border / solid / text + focus |
| `moss` | success green | 3, 7, 9, 11 | success soft / border / solid / text |
| `harvest` | warning amber | 3, 7, 9, 11 | warning soft / border / solid / text |
| `clay` | error red | 3, 7, 9, 11 | error soft / border / solid / text |
| `sky` | info blue | 3, 7, 9, 11 | info soft / border / solid / text (tuned independently of `signal`) |

Rules: steps are plain `:root` / `.dark` properties (not `@theme`
`--color-*` entries), so Tailwind emits no utilities for them and components
cannot consume them directly — the only future consumer is `semantic.css`.
Unmaterialized steps (4, 5, 10, and the rest) stay reserved; they can be
added later without renumbering. Values are PostVIA-owned OKLCH picks
anchored near today's semantic hues, not copied from any external palette.

**Semantic mapping is unchanged.** No `semantic.css` token points at these
steps yet; rendered output is identical. The remapping is Phase 2 work.

## 2. Semantic tokens — canonical

Each row is a Tailwind utility family (`bg-*`, `text-*`, `border-*`, …).

| Group | Token | Light | Dark |
| --- | --- | --- | --- |
| Background | `--background` | `#F5F4EE` | `#262624` |
| Foreground | `--foreground` | `#20201E` | `#F5F4EE` |
| Muted | `--muted` | `#E7E5DE` | `#38362F` |
| Muted | `--muted-foreground` | `#65645D` | `#B3B2AC` |
| Panel | `--panel` | `#F0EFEB` | `#222120` |
| Panel | `--panel-foreground` | → `--foreground` | → `--foreground` |
| Surface | `--card` / `--card-foreground` | `#FAF9F5` / `#20201E` | `#2C2C2B` / `#F5F4EE` |
| Surface | `--popover` / `--popover-foreground` | `#FAF9F5` / `#20201E` | `#2C2C2B` / `#F5F4EE` |
| Elevation | `--elevation-sunken / -surface / -raised / -overlay` | → `muted / panel / card / popover` | same aliases |
| Border | `--border` | `#E3E2DE` | `#34332F` |
| Border | `--input` | `#DEDCD5` | `#3A3935` |
| Border | `--ring` | `#2971C6` | `#5FA1F3` |
| Primary | `--primary` / `--primary-foreground` | `#286FC2` / `#FFFFFF` | `#5FA1F3` / `#0F0F0E` |
| Success | `--success` / `--success-foreground` | `#2F8F5B` / `#FFFFFF` | `#69B887` / `#102217` |
| Warning | `--warning` / `--warning-foreground` | `#C58A24` / `#3D2C0E` | `#D6A64A` / `#261D0D` |
| Error | `--error` / `--error-foreground` | `#C84B4B` / `#FFFFFF` | `#E06A6A` / `#260F0F` |
| Info | `--info` / `--info-foreground` | `#2971C6` / `#FFFFFF` | `#5FA1F3` / `#0F0F0E` |
| Navigation | `--sidebar`, `--sidebar-foreground`, `--sidebar-primary(-foreground)`, `--sidebar-accent(-foreground)`, `--sidebar-border`, `--sidebar-ring` | rail one shade off the page | rail one shade off the page |

Meaning, in one line each:

- **Background** — the page canvas.
- **Foreground / Muted** — ink, and its quiet counterpart for metadata.
- **Panel** — a block on the page: one shade off the canvas, **no outline**.
  A block nested inside a panel goes the other way (`bg-background`) so it
  reads as inset.
- **Surface** — `card` is a block that may lift; `popover` is genuinely
  floating UI and is the only tier where a shadow is allowed.
- **Elevation** — PostVIA elevates by **tone**, not shadow. The four-step
  ladder above is the whole elevation system.
- **Border** — hairlines for structural splits only. An outline on a block
  is an accent, never a default.
- **Primary** — one brand hue (PostVIA Blue #286FC2 / #5FA1F3),
  reserved for primary actions, active navigation, selected tabs, links,
  focus and main CTAs. Red is reserved for error/destructive only.
- **Success / Warning / Error / Info** — status hues live in dots and badges
  only. `info` is the SCHEDULED state: a routine future-dated post must not
  look like an alert.
- **Status text inks** — the ONLY status colours allowed for running text:
  `--success-text` (`#26774A` / `var(--success)`), `--warning-text`
  (`#896119` / `var(--warning)`), `--error-text` (`#B04545` / `#E78282`),
  `--info-text` (`#2569B6` / `#65A5F3`). The base hues are fills and dots
  (exempt from text contrast) and fail 4.5:1 as copy on light surfaces
  (measured 2026-09 with axe in real Chromium). Status chips
  (`StatusBadge`) keep the hue in the dot + tinted shell and set the label
  in neutral `text-foreground`.

### Legacy aliases (canonical layer, deprecated names)

Aliases, never values. Each resolves to a canonical token, so there is one
place to change.

| Legacy | Resolves to | Use instead | Why it is still here |
| --- | --- | --- | --- |
| `--accent` | `--muted` | `--muted` | Held a value identical to `--muted` in both themes; the neutral fill step |

Removed (zero consumers, verified repo-wide): `--destructive` (the token;
`variant="destructive"` remains live as Button API and maps directly to
`--error`), `--signal` / `--signal-foreground` (the SCHEDULED state they
once named now uses `--info`), `--secondary` / `--secondary-foreground`, and
`--accent-foreground`.

## 3. Historical: the Radian name mapping (removed)

`src/app/design-system/compat-radian.css` used to translate Radian's own
token vocabulary onto the canonical tokens, so `src/components/ui`'s
Radian-generated primitives could keep their original classnames. It has
been deleted — every call site now writes the canonical name directly.
This table is kept only so old branches, PRs, or screenshots that still
reference a Radian name can be read against today's system.

| Old Radian name | → today's PostVIA class |
| --- | --- |
| `bg` | `background` |
| `fill1` / `fill4` | `muted` |
| `fill2` / `fill3` / `soft` | `accent` |
| `fg` | `foreground` |
| `fg-secondary` / `fg-tertiary` / `fg-disabled` | `muted-foreground` |
| `fg-inverse` | `background` |
| `alpha` / `soft-alpha` / `fill1-alpha` / `fill2-alpha` | `overlay-12` / `overlay-8` / `overlay-4` / `overlay-8` |
| `elevation-negative` / `-level1` / `-level2` | `elevation-sunken` / `elevation-raised` / `elevation-raised` |
| `white-inverse` / `black-inverse` | `background` / `foreground` |
| `primary-fg` / `-text` / `-border` / `-hover` / `-accent` / `-focus` | `primary-foreground` / `primary` / `primary` / `primary` / `accent` / `ring` |
| `success` / `warning` / `error` `-fg` / `-text` | `<status>-foreground` / `<status>` |
| `info-fg` | `info-foreground` |
| `<status>-accent/-focus/-border/-hover`, `info-text` | unchanged name — now a first-class token in `semantic.css` (§1's "Status sub-steps"), not a compat alias |
| `sidebar-fg` / `sidebar-accent-fg` | `sidebar-foreground` / `sidebar-accent-foreground` |
| `font-body` | `font-sans` |

Two genuine gaps outlive the compat file, now recorded directly against
`semantic.css` — closing either is a design decision with a visual
consequence, not a rename: `--muted`/`--accent` still stand in for
Radian's four-step `fill1`–`fill4` ramp (PostVIA uses two steps, not
four), and `--elevation-raised` still covers both of Radian's `level1`
and `level2` (`card` and `popover` are the same colour in both themes
today).

## 4. Components

All primitives live in `src/components/ui`, originally scaffolded by the
RadianUI generator (`radianui.com`) and built on Radix UI
(`@radix-ui/react-*`) for accessibility behaviour — focus trap, portals,
ARIA. Styling now speaks PostVIA's canonical vocabulary only (§3); Radix
stays, since it's behaviour, not a design-system concern. The table below
records each component's current public API.

| Target component | File | API notes |
| --- | --- | --- |
| Button | `ui/button.tsx` | Direct PostVIA contract: `variant` `default / secondary / outline / ghost / destructive / link` (`destructive` maps to `--error`), `size` `default / sm / lg / icon-sm`. Composition is `asChild` only (a `Link` child receives the classes via Slot) — the legacy `render` / `nativeButton` props were removed once every call site migrated. History: a `POSTVIA_VARIANT_MAP / POSTVIA_SIZE_MAP / POSTVIA_SIZE_FIXES` layer used to translate these onto an internal Radian-style axis, with extra `xs / icon / icon-xs / icon-lg` sizes and `glossy / smooth` variants — all unreachable (zero call sites) and removed; the remaining class sets are unchanged. There is no `loading` prop — async actions compose `Spinner + data-icon + disabled`. Geometry: always `rounded-full`. |
| Input | `ui/input.tsx` | numeric sizes; `InputGroup` chrome |
| Textarea | `ui/text-area.tsx` | previous defaults preserved (`min-h-16`, `resize-none`) |
| Select | `ui/select.tsx` | trigger kept `w-fit` pill |
| Checkbox | `ui/checkbox.tsx` | — |
| Radio | `ui/radio-group.tsx` | Library surface, currently unused in app — onboarding plan choice uses validated native `fieldset`/`radio` inputs (keyboard: one Tab stop, arrows move, no JS key handling; covered by `tests/e2e/a11y.spec.ts`) |
| Switch | `ui/switch.tsx` | — |
| Badge | `ui/badge.tsx` | `variant` `strong / outline / soft`, `size` `20 / 24`, semantic `color` `primary / error / neutral` (default); `BadgeDot`. Post statuses go through the `StatusBadge` domain gateway, never through a Badge color — and `StatusBadge` labels are neutral `text-foreground` (hue lives in the dot + tinted shell, which passes 4.5:1 where colored running text did not). History: the color axis spanned the full 17-hue palette plus `info / success / warning`, and a `28` size existed — zero call sites, removed. |
| Avatar | `ui/avatar.tsx` | default 32px (`size-8`); `data-size` drives `AvatarBadge`; PostVIA extension layer preserved verbatim. `AvatarFallback` tint axis narrowed to the four product hues (`red / emerald / amber / light-blue`); the default is muted monochrome. |
| Tabs | `ui/tabs.tsx` | URL-driven links for status filters. `TabsTrigger asChild` strips the button-only `type` attribute (an `<a type="button">` is invalid HTML); URL-driven tab lists set `aria-controls={undefined}` because there is no tabpanel element (the filtered page is the panel) — arrow-key travel between triggers keeps working |
| Tooltip | `ui/tooltip.tsx` | — |
| Dropdown | `ui/dropdown-menu.tsx` | — |
| Dialog | `ui/dialog.tsx`, `ui/drawer.tsx`, `ui/popover.tsx` | — |
| Card | `ui/card.tsx` | `size` prop (`default`/`sm`, spacing 6/4) — no upstream size prop; `bg-card`, `border-transparent` |
| Table | — | **Missing as a primitive.** Post and calendar tables are hand-rolled grids (`PostsList`, `CalendarView`). |
| Pagination | — | **Missing as a primitive.** `PostsList` renders its own controls. |
| Toast | `ui/toast.tsx` | PostVIA `Toaster` + `toast()` helper; `ToastIcon` is exported for outside composition |
| Navigation | `ui/sidebar.tsx`, `components/Sidebar.tsx`, `components/nav-items.ts` | rail 16rem / icon 3rem / mobile 18rem (upstream 16.25 / 3.75); `variant="floating"`, `theme="gray"`; floating container `p-2` (8px canvas inset, collapsed width accounts padding + 1px border); nav items are pills; `SidebarMenuButton` has only the `neutral` tone (the `soft` / `strong` brand-hue actives had zero call sites and were removed) |

Supporting primitives with no slot in the target list, all in use:
`alert`, `banner`, `calendar`, `collapsible`, `divider`, `empty`, `field`,
`label`, `progress`, `skeleton`, `spinner`.

## 5. Patterns

| Pattern | Where |
| --- | --- |
| Form | `ui/field.tsx` — `FieldGroup + Field + FieldLabel`, `data-invalid` on the Field, `aria-invalid` on the control |
| Filters | `ui/tabs.tsx` as a URL-driven segmented control + the search/platform/sort toolbar in `app/posts/PostsList.tsx` |
| Data table | `app/posts/PostsList.tsx` (hand-rolled grid, no primitive) |
| Empty state | `ui/empty.tsx`, `components/StateBlock.tsx` |
| Dashboard | `app/dashboard/*` — `NextUp`, `PostRow`, `InsightList`, `ActivityChart`, `OutcomeDonut` |
| Composer | `app/posts/new/_components/*` — `ComposerCard`, `ChannelStrip`, `MediaGrid`, `PublishCard`, `ScheduleDialog`, `preview/*` |
| Calendar | `app/calendar/CalendarView.tsx` + `ui/calendar.tsx` (`react-day-picker`) |
| Shells | `components/AppShell.tsx`, `AuthShell.tsx`, `LegalPageShell.tsx`, `layout/PageContainer.tsx`, `Section.tsx`, `PageHeader.tsx` |
| Status language | `components/StatusBadge.tsx` — one dot + one label everywhere |
| Platform glyphs | `components/PlatformIcon.tsx` — fill-based brand marks on a 24px grid |

## Known hard-coded values

Left in place on purpose.

| Where | What | Why |
| --- | --- | --- |
| `components/GoogleButton.tsx`, `app/settings/SettingsClient.tsx` | Google `#4285F4 / #34A853 / #FBBC05 / #EA4335` | Third-party brand mark; a token would be wrong |
| `lib/email.ts` | full inline hex palette | Transactional email HTML — mail clients do not support CSS custom properties |
| `app/posts/new/_components/preview/TikTokPreview.tsx` | `text-white`, `text-white/70`, `text-white/90` | Deliberate mimicry of the TikTok surface inside a preview mock |
| `ui/*` unreachable variant bodies | `bg-black`, `text-white` | Removed with the second cleanup wave (`glossy` / `smooth` Button variants had zero call sites) |
| `ui/tooltip.tsx` arrow | `drop-shadow-[0_1px_0_var(--color-border)]` | Radix-anchored arrow fill; the token reference is intentional |
| none remaining | `text-[10px] / [11px] / [13px] / [15px]` | Named in foundations as `--text-micro/-meta/-label/-prose`; every exact-equivalent site is migrated (see below) |

### Why the remaining `text-[Npx]` call sites were migrated last

`cn()` is `twMerge(clsx(...))`. `tailwind-merge` classifies an unknown
`text-*` class by its own validators; a custom font-size name such as
`text-prose` is not in its config, so it would most likely be filed under
`text-color` and start conflicting with a neighbouring `text-muted-foreground`
in the same class string — silently dropping one of them. Migrating the call
sites therefore needed `extendTailwindMerge` in `src/lib/utils.ts` first,
which now registers `text-label / text-meta / text-prose / text-micro` in
the `font-size` group. The exact-equivalent arbitrary sites
(`MarketingSections.tsx`, `bulk-social-media-scheduling/page.tsx`) are
migrated; the tooltip arrow arbitrary stays — it is a Radix-anchored
exception, not a type size.
