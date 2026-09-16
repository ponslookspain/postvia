# PostVIA Design Tokens

The canonical token inventory. `docs/design-system.md` describes how the
product *uses* the system (rules, screen notes, voice); this file records
*what the system is made of* and where each name lives.

## Where the design system lives

```
src/app/globals.css                        entry: imports, dark variant, @layer base
src/app/design-system/foundations.css      1. Foundations   — raw scales
src/app/design-system/semantic.css         2. Semantic      — CANONICAL
src/app/design-system/compat-radian.css    3. Compatibility — NOT canonical
src/app/layout.tsx                         font families (next/font)
src/components/ui/*                        components (Radian implementations)
src/components/*                           patterns and shells
```

**The canonical design system is `src/app/design-system/semantic.css`.**
Everything else is either an input to it (foundations, fonts) or a
translation of it (the Radian compatibility layer). A tool reading this
repository should treat `semantic.css` as the token source of truth and
`compat-radian.css` as a legacy adapter scheduled for removal.

Direction of truth:

```
foundations.css  →  semantic.css  →  compat-radian.css  →  components
                    ^^^^^^^^^^^^
                    canonical
```

## Theming

`dark` is the product default; light is opt-in. The `dark` class is written
to `<html>` by a blocking script before first paint
(`src/hooks/use-theme.ts`), persisted in `localStorage`, and toggled from
Appearance in the account menu.

Because `.dark` sits on `<html>` — the same element as `:root` — a token
declared as an alias (`--destructive: var(--error)`) resolves against
whichever value is in effect. Aliases are therefore declared once, in
`:root`, and `.dark` restates real values only.

Every canonical token is defined for both themes. Three status hues
(`--info`, and every `-foreground` ink) intentionally carry one value across
both themes because they stay legible on either canvas.

## 1. Foundations

| Group | Tokens | Notes |
| --- | --- | --- |
| Colors | 17-hue OKLCH palette (`--color-red` … `--color-rose`, `--color-neutral`), each with `base / accent / focus / border / hover / text / fg`, plus a full `.dark` re-map | Primitives. Components must not use them directly; `semantic.css` names the four PostVIA uses (red, emerald, amber, light-blue). Kept because the Radian primitives accept a `color` prop across the whole palette. |
| Typography | `--font-sans` (Inter, body), `--font-heading` (DM Sans), `--font-mono` (Geist Mono) | Families come from `next/font` in `layout.tsx`. Declared with `@theme inline` so the utility points at the next/font variable instead of self-referencing. |
| Typography | `--text-micro` 10px · `--text-meta` 11px · `--text-label` 13px · `--text-prose` 15px | The four half-steps Tailwind's ramp lacks. Font size only — line height stays at the call site. |
| Spacing | `--spacing` 0.25rem | Tailwind's base step, stated explicitly. |
| Spacing | `--page-narrow` 48rem · `--page-default` 64rem · `--page-wide` 76rem · `--section-gap` 2.5rem · `--measure-prose` 68ch | Consumed by `PageContainer`, `PageSections`, `PageHeader`, `SectionHeader`. |
| Radius | `--radius` 0.875rem, and `--radius-sm … --radius-4xl` derived from it | One base, everything else `calc()`. Buttons are always `rounded-full`. Never add an arbitrary radius at a call site. |
| Motion | `--duration-fast` 150ms · `--duration-base` 200ms · `--duration-slow` 300ms · `--ease-standard` linear · `--ease-emphasized` `cubic-bezier(.22,1,.36,1)` | Read off what the components already use. `prefers-reduced-motion` is honoured globally in `globals.css`. |

Surfaces, Borders and Elevation are tone decisions rather than raw scales,
so they live in the semantic layer.

## 2. Semantic tokens — canonical

Each row is a Tailwind utility family (`bg-*`, `text-*`, `border-*`, …).

| Group | Token | Light | Dark |
| --- | --- | --- | --- |
| Background | `--background` | `oklch(1 0 0)` | `oklch(0.145 0 0)` |
| Foreground | `--foreground` | `oklch(0.145 0 0)` | `oklch(0.985 0 0)` |
| Muted | `--muted` | `oklch(0.97 0 0)` | `oklch(0.269 0 0)` |
| Muted | `--muted-foreground` | `oklch(0.556 0 0)` | `oklch(0.708 0 0)` |
| Panel | `--panel` | `oklch(0.974 0 0)` | `oklch(0.185 0 0)` |
| Panel | `--panel-foreground` | → `--foreground` | → `--foreground` |
| Surface | `--card` / `--card-foreground` | `oklch(1 0 0)` / `oklch(0.145 0 0)` | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` |
| Surface | `--popover` / `--popover-foreground` | `oklch(1 0 0)` / `oklch(0.145 0 0)` | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` |
| Elevation | `--elevation-sunken / -surface / -raised / -overlay` | → `muted / panel / card / popover` | same aliases |
| Border | `--border` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 10%)` |
| Border | `--input` | `oklch(0.922 0 0)` | `oklch(1 0 0 / 15%)` |
| Border | `--ring` | `oklch(0.708 0 0)` | `oklch(0.556 0 0)` |
| Primary | `--primary` / `--primary-foreground` | `oklch(0.58 0.22 19)` / `oklch(0.985 0 0)` | `oklch(0.62 0.22 19)` / `oklch(0.985 0 0)` |
| Success | `--success` / `--success-foreground` | `oklch(0.55 0.15 150)` / `oklch(1 0 0)` | `oklch(0.72 0.15 150)` / same |
| Warning | `--warning` / `--warning-foreground` | `oklch(0.62 0.15 75)` / `oklch(0.445 0.087 78.294)` | `oklch(0.78 0.13 75)` / same |
| Error | `--error` / `--error-foreground` | `oklch(0.577 0.245 27.325)` / `oklch(1 0 0)` | `oklch(0.704 0.191 22.216)` / same |
| Info | `--info` / `--info-foreground` | `oklch(0.61 0.203 255.637)` / `oklch(1 0 0)` | same | 
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
- **Primary** — one brand hue (crimson), reserved for primary actions. Held
  a step off `error` in hue (~19 vs ~27) so a CTA never reads as a failure.
  Navigation never wears it.
- **Success / Warning / Error / Info** — status hues live in dots and badges
  only. `info` is the SCHEDULED state: a routine future-dated post must not
  look like an alert.

### Legacy aliases (canonical layer, deprecated names)

Aliases, never values. Each resolves to a canonical token, so there is one
place to change.

| Legacy | Resolves to | Use instead | Why it is still here |
| --- | --- | --- | --- |
| `--destructive` | `--error` | `--error` | `variant="destructive"` and `text-destructive` call sites |
| `--signal` / `--signal-foreground` | `--primary` / `--primary-foreground` | `--primary` | 14 call sites, mostly landing page. The SCHEDULED state it once named now uses `--info`. |
| `--accent` | `--muted` | `--muted` | Held a value identical to `--muted` in both themes; feeds the Radian `fill2/fill3/soft` aliases |
| `--accent-foreground` | own value | — | Radian `fill` ink |
| `--secondary` / `--secondary-foreground` | own values | — | No utility consumes them today; retained so the Radian `secondary` surface keeps a value |

## 3. Radian compatibility layer — **not canonical**

`src/app/design-system/compat-radian.css` maps Radian's vocabulary onto the
canonical tokens so the primitives in `src/components/ui` keep working. It
holds no values.

| Radian name | → PostVIA |
| --- | --- |
| `bg` | `--background` |
| `fill1` / `fill4` | `--muted` |
| `fill2` / `fill3` / `soft` | `--accent` (→ `--muted`) |
| `fg` | `--foreground` |
| `fg-secondary` / `fg-tertiary` / `fg-disabled` | `--muted-foreground` |
| `fg-inverse` | `--background` |
| `alpha`, `soft-alpha`, `fill1-alpha` … `fill4-alpha` | `color-mix()` of `--foreground` at 12 / 8 / 4 / 8 / 12 / 16% |
| `elevation-negative` / `-level1` / `-level2` | `--elevation-sunken` / `-raised` / `-raised` |
| `white-inverse` / `black-inverse` | `--background` / `--foreground` |
| `primary-fg/-text/-border/-hover/-accent/-focus` | `--primary-foreground`, `--primary`, `--primary`, `--primary`, `--accent`, `--ring` |
| `success-fg` / `-text` | `--success-foreground` / `--success` |
| `warning-fg` / `-text` | `--warning-foreground` / `--warning` |
| `error-fg` / `-text` | `--error-foreground` / `--error` |
| `info-fg` | `--info-foreground` |
| `<status>-accent/-focus/-border/-hover` | Radian emerald / amber / red / light-blue primitives |
| `sidebar-fg` / `sidebar-accent-fg` | `--sidebar-foreground` / `--sidebar-accent-foreground` |
| `font-body` | `--font-sans` |

### Known gaps

Recorded, not hidden. Closing one is a design decision with a visual
consequence, not a cleanup.

- `primary-hover` / `primary-border` / `primary-accent` reuse the base, the
  base and `--accent` instead of hue-matched steps.
- `fill1`–`fill4` all resolve to the same neutral; Radian defines four
  distinct steps.
- `fg-secondary` / `fg-tertiary` / `fg-disabled` share `--muted-foreground`.
- `elevation-level2` has no distinct PostVIA value (`card` and `popover` are
  the same colour in both themes today).
- `--color-stroke` is absent — stock Radian does not define it either.

## 4. Components

All primitives live in `src/components/ui` and are Radian implementations.
Several carry a **legacy PostVIA API on top** so existing call sites did not
have to change during the migration. The legacy surface is documented here
so it can be removed deliberately rather than discovered.

| Target component | File | Legacy PostVIA API on top of Radian |
| --- | --- | --- |
| Button | `ui/button.tsx` | `variant`: `default / secondary / outline / ghost / destructive / link` → Radian `variant`+`color` (`POSTVIA_VARIANT_MAP`). `size`: `default / xs / sm / lg / icon / icon-xs / icon-sm / icon-lg` → Radian `28…48` (`POSTVIA_SIZE_MAP`) plus icon padding fixes (`POSTVIA_SIZE_FIXES`). `render` (BaseUI composition) and `nativeButton` (accepted, never rendered). Geometry: always `rounded-full`. |
| Input | `ui/input.tsx` | Radian sizes; `InputGroup` chrome |
| Textarea | `ui/text-area.tsx` | previous defaults preserved (`min-h-16`, `resize-none`) |
| Select | `ui/select.tsx` | trigger kept `w-fit` pill |
| Checkbox | `ui/checkbox.tsx` | — |
| Radio | `ui/radio-group.tsx` | — |
| Switch | `ui/switch.tsx` | — |
| Badge | `ui/badge.tsx` | `variant`+`color` across the full 17-hue palette; `BadgeDot` |
| Avatar | `ui/avatar.tsx` | default 32px (`size-8`); `data-size` drives `AvatarBadge`; PostVIA extension layer preserved verbatim |
| Tabs | `ui/tabs.tsx` | URL-driven links for status filters |
| Tooltip | `ui/tooltip.tsx` | — |
| Dropdown | `ui/dropdown-menu.tsx` | — |
| Dialog | `ui/dialog.tsx`, `ui/drawer.tsx`, `ui/popover.tsx` | — |
| Card | `ui/card.tsx` | `size` prop (`default`/`sm`, spacing 6/4) — Radian has none; `bg-panel`, `border-transparent` |
| Table | — | **Missing as a primitive.** Post and calendar tables are hand-rolled grids (`PostsList`, `CalendarView`). |
| Pagination | — | **Missing as a primitive.** `PostsList` renders its own controls. |
| Toast | `ui/toast.tsx` | PostVIA `Toaster` + `toast()` helper |
| Navigation | `ui/sidebar.tsx`, `components/Sidebar.tsx`, `components/nav-items.ts` | rail 16rem / icon 3rem / mobile 18rem (upstream 16.25 / 3.75); `variant="inset"`, `theme="gray"`; nav items are pills |

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
| `ui/*` Radian variants (`glossy`, `smooth`, `strong/neutral`) | `bg-black`, `text-white` | Stock Radian variant bodies; the PostVIA variant map never selects most of them |
| ~50 call sites | `text-[10px] / [11px] / [13px] / [15px]` | Now named in foundations as `--text-micro/-meta/-label/-prose`; the call sites are **not** migrated — see below |

### Why the `text-[Npx]` call sites were not migrated

`cn()` is `twMerge(clsx(...))`. `tailwind-merge` classifies an unknown
`text-*` class by its own validators; a custom font-size name such as
`text-prose` is not in its config, so it would most likely be filed under
`text-color` and start conflicting with a neighbouring `text-muted-foreground`
in the same class string — silently dropping one of them. Migrating the call
sites therefore needs `extendTailwindMerge` in `src/lib/utils.ts` first. The
tokens exist so the scale is canonical and discoverable; the swap is a
separate, testable change.
