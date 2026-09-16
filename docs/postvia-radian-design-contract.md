# PostVIA × Radian Design Contract

Normative visual contract for the future PostVIA redesign under Radian UI.
This document is the **single internal source of truth** for visual/system decisions.
It proposes no code changes itself; it fixes what the redesign must conform to.

Status: preparatory contract + foundation alignment (implemented on `dev`, uncommitted).
Sections marked [ALIGNED] were implemented in the foundation step; everything
else still describes the pre-alignment state or future page redesign.

Related: `docs/design-system.md` describes what is **implemented today**; this contract describes what the **redesign must converge to** and what is still unconfirmed.

## 0. Sources and confidence rule

Used as normative sources:

1. Radian 0.3.8 component source / registry — **not present in this repo; not inspected**
2. `.agents/skills/radian/SKILL.md` — inspected (Radian CLI, mapping table, palette rule, workflow)
3. Official Radian documentation — **fetched for foundation step**: `fundamentals/colors.md` (full token table with light/dark hex), `fundamentals/typography.md` (Inter body / Geist headings; H1-H6 numeric specs NOT published as text), `fundamentals/theme/nextjs.md`, `components/button.md` (canonical API + rounded-full as opt-in override), `components/input.md` (sizes, `text-error-text` error pattern), `components/card.md` (no `size` prop; `heading-5/heading-6` title classes), `components/sidebar.md` (CSS-var widths, `--sidebar-width-mobile`, resizable min 250 / max 500, sidebar theme vars incl. `--color-sidebar-ring: var(--color-primary-border)`)
4. Radian Figma Design System — **not present in this repo; not inspected**
5. Current PostVIA repository — inspected (`src/app/globals.css`, `src/app/utility.css`, `components.json`, `src/app/layout.tsx`, `src/components/ui/*`, page shells, layout primitives)

Rule: any Radian-canonical value that cannot be confirmed from sources 2 or 5 is marked `NOT CONFIRMED`. Do not invent values. OpenCode must resolve every `NOT CONFIRMED` against the Radian 0.3.8 registry/Figma before changing code.

Prior read-only audit (no scores, per instruction) found: infra COMPLIANT; most primitives PARTIALLY COMPLIANT (stock core + PostVIA shims); Button/Card/Field/Toast/Sidebar/shells CUSTOM (intentional); Table/DropdownMenu/Pagination and exact registry values UNKNOWN.

## 1. Theme classification

`components.json` (inspected): `style: default`, `iconLibrary: lucide`, `hasSrcDir: true`, aliases `components/ui/utils/lib/hooks` standard plus product-specific `animated: @/components/animated`.

`src/app/globals.css` layers:

- **RADIAN CANONICAL**: `src/app/utility.css` 17-hue OKLCH palette (`red…rose` + `neutral`), each with `base/accent/focus/border/hover/text/fg`, plus `.dark` re-maps. This file is stock Radian shape.
- **POSTVIA BRAND**: `--primary` indigo (`light oklch(0.488 0.243 264.376)`, `dark oklch(0.424 0.199 265.638)`), `--primary-foreground`, `--signal/--signal-foreground` alias pair, dispatch-desk comment (Paper/Wash/Line/Ink + Signal/Moss/Honey/Ember intent).
- **POSTVIA PRODUCT**: `--background/foreground/muted/muted-foreground/border/input/ring/card/popover/secondary/accent`, `--page-narrow:48rem/--page-default:64rem/--page-wide:76rem/--section-gap:2.5rem`, `--radius:0.875rem` + derived `--radius-sm…4xl`, `--chart-1…5`, `--sidebar*`, `@layer base` rules, `::selection signal 18%`, `post-in/how-progress` keyframes + reduced-motion guard.
- **DEPRECATED BRIDGE → CANONICAL CONTRACT [ALIGNED]**: the `@theme` block is now
  the documented Radian semantic contract (`globals.css:113-134` header cites
  `docs/fundamentals/colors.md` + known gaps). `--error` holds the canonical
  value, `--destructive: var(--error)` is the compat alias (legacy
  `variant="destructive"` / `text-destructive` still work, same value).
  `signal` stays a product alias of `primary`. `chart-*` tokens were REMOVED
  (zero usages in src, not part of the Radian color system).
  `--color-stroke` remains intentionally absent.

Tokens that must disappear after alignment: ~~`signal/signal-foreground` (fold into `primary`), `destructive` (fold into `error`) or vice versa per registry, `muted/accent` duplicates where `fill*/soft` are canonical, `ring` where hue-matched `*-focus` are canonical, legacy `chart-1…5` if Radian recipe differs.~~ **Decided in foundation step**: `signal` stays as documented product alias; `destructive` stays as value-identical alias of canonical `error`; `muted/accent/ring` stay as value holders (pages use `bg-background/text-foreground/border-border/...` and cannot be renamed without page changes); `chart-1…5` REMOVED (unused). Remaining known gaps (documented in `globals.css`, no invented values): hue-matched `primary-hover/border/accent` steps; four distinct `fill1-4` steps (docs `#F9F9FA/#F4F4F6/#E9E9EC/#DEDEE3`); distinct `fg-secondary/tertiary/disabled` steps.

Theme modes: light `:root`, dark `.dark`, `@custom-variant dark (&:is(.dark *))` in both CSS files. Dark inherits through the bridge via `var()` — preserve this mechanism.

## 2. Color contract

| Token | Radian value / source | PostVIA current | Final PostVIA value | Status |
|---|---|---|---|---|
| `primary` | Default brand `violet-blue` (#623DF5) per skill §1 + colors doc | light `oklch(0.488 0.243 264.376)`, dark `oklch(0.424 0.199 265.638)` | **DECIDED [ALIGNED]: keep PostVIA indigo** (brand + dispatch-desk) | colors doc, `globals.css:24-27` |
| `primary-fg/text/border/hover/accent/focus` | Radian semantic sub-tokens (colors doc: hover #7655F6, border #9981f8, accent #ECE8FC pastel, text #492EB8) | Aliases to PostVIA base/accent/ring | Keep aliases; hue-matched steps are a KNOWN GAP (no invented values) | colors doc, `globals.css:136-142` |
| `success/*` | `emerald` palette (docs key #1DA54A) | Base stays PostVIA Moss; sub-tokens → `emerald-*` | **DECIDED [ALIGNED]: keep base** (status-dots-only rule) | colors doc, `globals.css` |
| `error/*` | `red` palette (docs key #F53D3D) | `--error` canonical, `--destructive` alias; sub-tokens → `red-*` | **DECIDED [ALIGNED]: unified on `error`** | colors doc, `globals.css` |
| `warning/*` | `amber` palette (docs key #FFAA00) | Base stays PostVIA Honey; sub-tokens → `amber-*` | **DECIDED [ALIGNED]: keep base** | colors doc, `globals.css` |
| `info/*` | `light-blue` palette (`utility.css:85-92` + dark `247-254`) | Pure Radian mapping, no PostVIA counterpart (`globals.css:157-163`) | KEEP as canonical | RADIAN DEFAULT |
| `bg` | Radian surface name (recipe `NOT CONFIRMED`) | Aliased to `--background` (`globals.css:166`) | KEEP name, confirm value vs registry | CONFIRM |
| `fill1/fill2/fill3/fill4` | Radian surface ramp (recipe `NOT CONFIRMED`) | `fill1/fill4→muted`, `fill2/fill3→accent` (`globals.css:167-170`) | Confirm ramp vs registry; keep distinct steps | CONFIRM |
| `fg/fg-secondary/fg-tertiary/fg-disabled/fg-inverse` | Radian fg ramp (recipe `NOT CONFIRMED`) | `fg→foreground`, `secondary/tertiary/disabled→muted-foreground`, `inverse→background` (`globals.css:171-175`) | Confirm ramp; disabled may need its own step | CONFIRM |
| `border/border-soft/border-alpha/border-soft-alpha` | `border-border/border-*` + `soft-alpha` (values in components, recipe `NOT CONFIRMED`) | PostVIA `--border` + bridge `soft→accent`, `soft-alpha→8% fg mix` (`globals.css:179-180`) | Canonical border scale | CONFIRM |
| `elevation-negative/level1/level2` | Radian elevation names (recipe `NOT CONFIRMED`) | `negative→muted`, `level1/level2→card` (`globals.css:187-189`) | Confirm; Card currently shadowless by compat | CONFIRM |
| `white-inverse/black-inverse` | Theme-flipped pair (`globals.css:192-193`) | `white-inverse→background`, `black-inverse→foreground` | KEEP mechanism | POSTVIA-SPECIFIC, keep |
| `sidebar*` (+ `sidebar-fg`, `sidebar-accent-fg` shorts) | Radian sidebar tokens; shorts `NOT CONFIRMED` | PostVIA values + short aliases (`globals.css:45-52,196-197`) | Verify OKLCH vs registry | CONFIRM |

Strict rule (skill §5): never use numbered Tailwind colors (`bg-red-500`, `text-zinc-500`, …). Always `bg-red/text-red-text/border-red-border/bg-primary/text-success-fg/border-border` etc. No numbered-color usage was found in the audit grep; the violation to fix is `text-white` on colored surfaces → `text-*-fg` / `text-primary-fg` (Button strong info/success/error/warning, Alert/Banner strong, Checkbox checked, Calendar selected, Sidebar active).

**[ALIGNED] `text-white` sweep done in `ui/`**: Button/Alert/Banner strong → `*-fg`
(value-identical except warning-strong, now canonical dark-on-amber);
Checkbox checked → `text-primary-fg`; Calendar selected → `text-primary-fg`
(also fixed `*:data-disabled:text-red-500` → `text-error-text`); Sidebar
active → `text-primary-fg`/`stroke-primary-fg`; Banner strong close →
`text-[current]`; Toast error icon `text-destructive` → `text-error-text`.
Remaining `text-white` in pages (upload overlays, video rows, TikTok
previews) are product-canvas and out of foundation scope.

## 3. Typography contract

Radian H1–H6 / Body / Body-medium / Body-small / Label / Caption / Button specs (font, size, line-height, weight, letter-spacing): `NOT CONFIRMED` — no registry type file in repo. Do not assume.

Current PostVIA fonts (`src/app/layout.tsx`): `Inter --font-sans` (body, applied on `<html>`), `DM_Sans --font-heading` (headings + `CardTitle`), `Geist_Mono --font-geist-mono` (mono). Bridge: `--font-body → --font-sans` (`globals.css:199-201`).

| Font | Verdict |
|---|---|
| Inter (body) | KEEP (also a Radian allowed font, skill §1; docs default body font) |
| DM Sans (headings) | **[ALIGNED] KEPT as documented product decision** (docs default is Geist; full heading-font swap is a page-redesign concern) |
| Geist Mono | KEEP for code/numeric contexts |
| Geist Sans variable | **[ALIGNED] REMOVED** from `layout.tsx` (was loaded but never used) |

Observed product scale (to be mapped, not copied blindly): page `text-2xl/leading-8/semibold/tracking-tight/balance` (`PageHeader.tsx:30`), section `text-lg/leading-7/medium/tracking-tight` (`Section.tsx:55`), body `text-sm/leading-5`, meta `text-xs`, descriptions capped `max-w-[68ch]`, `tabular-nums` for counts. One-offs `text-[13px]/[15px]/[11px]/[10px]`, `leading-[1.04]` hero, `text-5xl→7xl` landing hero — TOKENIZE or REMOVE at redesign (see §16).

## 4. Radius contract

Confirmed from installed component source (not registry — registry values `NOT CONFIRMED`, but these are the de-facto Radian shapes in the repo):

| Component | Radian shape in repo | PostVIA override | Status |
|---|---|---|---|
| Button 28/32 | `rounded-md` (`button.tsx:23-24`) | ~~Wrapper forces `rounded-4xl` pill (`button.tsx:346`)~~ **[ALIGNED] pill removed** — per-size Radian radius now applies; pill is opt-in via `className="rounded-full"` (docs “Rounded Button” example) | DONE |
| Button 36/40/44/48 | `rounded-lg` (`button.tsx:25-28`) | Same pill override | DONE (same change) |
| Input 28/32 / 40/44/48 | `rounded-md` / `rounded-lg` (`input.tsx`) | ~~Size 36 `rounded-4xl` compat~~ **[ALIGNED] 36 → `rounded-lg`** | DONE |
| Select trigger 28/32 / 40+ | `rounded-md` / `rounded-lg` | ~~Size 36 `rounded-4xl` compat~~ **[ALIGNED] 36 → `rounded-lg`** | DONE |
| Card / Dialog | `rounded-2xl` (`card.tsx:19`, `dialog.tsx:94`) | None | KEEP |
| Popover / Tooltip / Calendar day / Tabs-trigger / Alert | `rounded-md` / `rounded-lg` | None | KEEP |
| Drawer float/rounded | `rounded-xl` | None | KEEP |
| Badge 20/24/28 | `rounded-md`; dot `rounded-full` | None | KEEP |
| Avatar | circle `rounded-full`; square `sm→2xl` scale | Default-32 compat comment only | KEEP, CONFIRM default |
| Checkbox sm/md/lg | `rounded-sm/md/md` | None | KEEP |
| Switch pill/square | `rounded-full` / `rounded-md` root + thumb | None | KEEP |
| Skeleton | `rounded-xl` default (mergeable) | Compat comment only | KEEP |
| Sidebar floating/inset | `rounded-xl/lg` | None | KEEP |

Never add arbitrary radius values (existing `rounded-[inherit]` in Avatar is legitimate inheritance). Remaining `rounded-4xl` in `landing/ProductVisuals.tsx:152,268` is a marketing one-off — page scope, not foundation.

## 5. Spacing contract

Radian spacing system values: `NOT CONFIRMED` beyond the standard Tailwind scale in use. The following are the bindings the redesign must codify:

| Slot | Current PostVIA | Status |
|---|---|---|
| Page padding | `px-4 py-6 md:px-8 md:py-10` (`PageContainer.tsx`) | Product-specific rhythm — NEEDS redesign decision (adopt or keep) |
| Section spacing | `gap-[var(--section-gap)]` (2.5rem), overridden `gap-8` on dashboard/bulk | Same decision |
| Card padding | `px-6 py-6`, sm-density via `data-size` selectors (`card.tsx`) | CONFIRM vs registry, then keep |
| Dialog padding | body `p-5`, footer `p-4` (`dialog.tsx:123,135`) | CONFIRM vs registry |
| Form spacing | `FieldSet gap-6`, `FieldGroup gap-7`, `Field gap-3` (`field.tsx`) | Product-specific, keep if accessible |
| Sidebar spacing | header `px-3.5 py-3`, group `px-3 py-1.5`, menu `gap-0.5` | CONFIRM vs registry |
| Table spacing | No table component; lists `divide-y`, rows `py-4/5` | REDESIGN (adopt table or codify list) |
| Button/Input spacing | Per-size `h-*/px-*/gap-*` compounds (`button.tsx:51-56`) | CONFIRM vs registry after pill decision |
| Page widths 48/64/76rem (narrow/default/wide) | `--page-*` tokens + `max-w-3xl/5xl/6xl` | Product-specific — KEEP pending decision |
| 88rem composer shell (`NewPostComposer.tsx:1241`) | Widest one-off, bypasses `PageContainer` | NEEDS redesign decision (fold into `wide` or keep named `composer`) |

`pb-[max(0.75rem,env(safe-area-inset-bottom))]` mobile bar is legitimate product-specific — KEEP.

## 6. Elevation / border contract

| Slot | Contract |
|---|---|
| Border default | `border-border`; inputs/selects/dialog `border-alpha`; soft dividers `border-soft/soft-alpha`; colored outlines `border-*-border` |
| Focus ring | `focus-visible:ring-2` + `ring-*-focus` / `ring-border`; base `outline-ring/50` (`globals.css:252`). Gray `ring` must become hue-matched at redesign |
| Hover | `hover:bg-*-hover/focus/accent/fill*-alpha` per variant — preserve per-variant mapping |
| Active/pressed | Button `active:translate-y-px` (compat); `aria-expanded:bg-muted`; menu `data-[active]` states — CONFIRM vs registry |
| Disabled | `disabled:opacity-50/pointer-events-none`, `disabled:bg-fill*/text-fg-disabled` — keep pattern, confirm tokens |
| Card | Bordered, **no shadow** (compat, `card.tsx:17-18`) — CONFIRM vs registry (shadowless cards are a PostVIA rule in `design-system.md`) |
| Dialog / Drawer-float / Toast | `shadow-lg` floating only | KEEP |
| Select content / Popover / Tooltip | `shadow-md` (+ `shadow-black/5`) | KEEP |
| Input addon | `shadow-xs` | KEEP |

## 7. Component contract

For each component: RADIAN DEFAULT = stock CVA + `cn` + Radix where present; POSTVIA CUSTOMIZATION = compat shims listed; CUSTOMIZATION TO REMOVE = legacy API/geometry at redesign.

- **Button** (`button.tsx`): Radian `strong/soft/outline/ghost/link (+glossy/smooth stock API) × primary/info/success/error/warning/neutral × 28–48`, `loading`, icon auto-size, focus rings. **[ALIGNED components]**: cva verified stock; wrapper + `render/nativeButton` KEPT as thin compat (146 legacy call sites in pages; rewriting them is page scope). `data-icon` contract intact (set by consumers). Upstream `IconButton/CompactButton/ButtonGroup` NOT added (visuals NOT CONFIRMED; `icon/icon-*` sizes cover the need).
- **Input / Select**: **[ALIGNED]** size-36 pill removed (foundation); this stage verified sizes/padding/radius/border/focus/disabled/placeholder/icons all stock. `w-fit` trigger base KEPT (pages pass `w-full`; upstream default NOT CONFIRMED). No changes.
- **TextArea**: `resize-none` default KEPT (upstream default NOT CONFIRMED; flipping it would change composer behavior).
- **Badge**: full 17-hue `strong/outline/soft × 20/24/28` — **[ALIGNED] verified stock**, no changes (all 23 consumers use standard API).
- **Avatar**: stock + `AvatarBadge/Group/GroupCount` extension + default-32 — **[ALIGNED] verified; extensions KEPT** as product-specific.
- **Card**: `Card/Header/Title/Description/Content/Footer/Action`; **[ALIGNED] `size` prop KEPT** (11 page call sites; upstream has none — removing it is page scope). Title `font-heading text-base` KEPT (within upstream `heading-6`/`text-base` variation).
- **Alert / Banner / Empty / Divider / Collapsible / Progress / Spinner / Skeleton**: **[ALIGNED] verified stock** (+ `EmptyContent` compat kept, spinner-16 default kept, bare-icon 16px alert compat kept). No changes.
- **Checkbox / RadioGroup / Switch**: **[ALIGNED] verified stock** (sizes, radius, selected, disabled, focus, indicators). Switch thumb `bg-white` is stock upstream, kept. No changes.
- **Dialog / Drawer / Popover / Tooltip / Tabs / Calendar**: stock shapes; **[ALIGNED]** stale close-button comment fixed (uses shared Button ghost/icon-sm); Calendar/overlay colors done in foundation; rest verified, no changes.
- **Sidebar**: full primitive set + resize/drawer/keyboard/tooltip — KEEP functionality; **[ALIGNED]** active `text-white`/`stroke-white` → `primary-fg` pair. Widths (16rem/3rem/18rem) stay product decisions: docs confirm CSS-var mechanism (`--sidebar-width`, `--sidebar-width-mobile`, resizable min 250 / max 500) but publish no absolute defaults — upstream 16.25/3.75rem claim remains NOT CONFIRMED. Trigger stays on legacy Button API (consumer scope).
- Accessibility: preserve `data-slot` attributes, `Title` in overlays, `aria-*`/`data-[active|state]` selectors, `prefers-reduced-motion` guard. Composition via `asChild`/Slot kept.

## 8. PostVIA custom components (visual alignment only)

- **Field** (`field.tsx`): server-action architecture stays; **no RHF migration**. **[ALIGNED components]**: `FieldError` → Radian form-error pattern `text-xs font-normal text-error-text` (docs `components/input.md` “Error Input”); `role=alert`, dedup logic, `FieldDescription` (`text-sm`, product decision matching body size), label, spacing, focus, invalid parity all kept. `FieldGroup` rhythm kept.
- **Toast** (`toast.tsx`): Base-UI architecture stays; **no Sonner migration**. Visual target: Radian overlay tokens (`bg-popover`, `rounded-2xl`, `shadow-lg`, `ring-ring/50`), type `text-sm/medium`, close/error icon colors; Button usages inside migrate with §7.

## 9. Sidebar contract

| Slot | Radian default | PostVIA current | Final direction |
|---|---|---|---|
| Width | CSS-var mechanism (`--sidebar-width`), resizable min 250 / max 500 (docs) — no absolute defaults published | `16rem`, min 12rem / max 28rem (`sidebar.tsx`) | **[ALIGNED] KEEP as product decision** (upstream 16.25rem claim NOT CONFIRMED) |
| Collapsed rail | Same — no absolute default published | `3rem` | **[ALIGNED] KEEP as product decision** |
| Mobile | Drawer below 768px + `--sidebar-width-mobile` override (docs) | `18rem` drawer | KEEP (matches docs mechanism) |
| Spacing/active/menu/tooltip | Stock shapes | `sidebarMenuButtonVariants neutral/strong/soft`, tooltip-on-collapse | KEEP |
| Trigger | Radian Button | Legacy Button API (`SidebarTrigger`) | Migrate with §7 |
| Keyboard | `NOT CONFIRMED` | `Cmd/Ctrl+B` with input guard | KEEP behavior |
| Resize | `sidebar-resize` block exists (skill §4) | Custom drag handle + cookie + touch | KEEP, confirm vs block |

## 10. Form contract (visual spec)

Spacing: `FieldSet gap-6` → `FieldGroup gap-7` → `Field gap-3` → `FieldContent gap-1`. Typography: `FieldLabel/Title text-sm/medium`, `FieldDescription text-sm muted` (product decision), `FieldError text-xs error-text + role=alert` **[ALIGNED]**. Colors: error `text-destructive/border-error/ring-error-focus`; focus `border-primary/ring-2`; disabled `opacity-50/text-fg-disabled`. Required/helper-text patterns: keep current `FieldDescription` + `FieldError` composition; required-marker style is a redesign detail (no invention here). Architecture unchanged (§8).

## 11. Overlay contract

| Slot | Dialog | Drawer | Popover | Tooltip | Select |
|---|---|---|---|---|---|
| Radius | `rounded-2xl` | `rounded-xl` (float) | `rounded-md` | `rounded-md` | content `rounded-md` |
| Padding | body `p-5`, footer `p-4` | handle + `p-0` mobile pattern | default | `px-2 py-1.5` | items per size |
| Width | `max-w-[calc(100%-2rem)] sm:max-w-lg` | direction variants, composer `max-h-[85vh]` | `w-60` nav use | `max-w-70` | `min-w-[8rem]` |
| Shadow/overlay | `shadow-lg`, `bg-black/50` (+white/blur/transparent variants) | `shadow-lg` float | `shadow-md` | `shadow-md` | `shadow-md` |
| Close button | Migrates with Button | `handle=false` default | — | — | — |
| Focus/animation | `ring` + `animate-in/out fade/zoom` | same system | `slide` per side | `fade/zoom/slide` | same system |
| Mobile | centered → full-bleed decision at redesign | bottom sheet | — | hidden when inappropriate | native fallback untouched |

Exact registry numbers: `NOT CONFIRMED`.

## 12. Data UI contract

Radian approach (skill mapping): `Table` (+Header/Row/Cell), `DropdownMenu`, `Pagination`, `Badge` status, `Tabs` filters, `Empty`/`Skeleton`/`Alert` states. Current deviations: custom responsive grid-table (`PostsList.tsx:365-378`), bare `<button>` row menus (`PostRowMenu`, bulk rows, `ChannelStrip`, onboarding), “Showing N of M + Load more” instead of pagination, `divide-y` lists elsewhere.

| Deviation | Verdict |
|---|---|
| Custom grid-table | **[ALIGNED patterns] KEEP until page stage, then ADOPT Radian `Table`** (`table` not installed; installing it now without redesigning the grid would fork two systems) |
| Bare `<button>` menus/inputs (`PostRowMenu.tsx:131,147`, `BulkScheduler.tsx:861,1027`, `ChannelStrip.tsx:115`, `MediaGrid.tsx:162`, `PostDetailClient.tsx:188,809,820`, `MobileTopBar.tsx:78`, landing/faq/how-it-works buttons) | **[ALIGNED patterns] `PostRowMenu` migrated to `DropdownMenu`** (stock 0.3.8 `dropdown-menu` installed + `@radix-ui/react-dropdown-menu` dep; logic identical). Remaining bare buttons classified: avatar menu trigger (legitimate trigger-as-avatar) + bulk interval preset chips (segmented control, not a menu) + media/remove icon buttons (icon-only actions, no menu) — all KEEP with justification |
| Load-more + counts | **[ALIGNED patterns] KEEP** load-more + “Showing N of M” (page-stage decision; no UX change without redesign) |
| `divide-y` lists + `EmptyBlock/LoadingBlock/ErrorBlock` | KEEP as approved pattern if table is not adopted |
| Email `<table>` in `src/lib/email.ts` | KEEP — email HTML, out of scope |

## 13. Layout contract

Standard composition: `AppShell (min-h-screen md:flex) → Sidebar + MobileTopBar + main → PageContainer → PageHeader → PageSections → Section (+Header) → Card/Panel → grids/lists`. Rules: `narrow (48rem)` forms/settings/billing-gates; `default (64rem)` dashboard/posts/accounts; `wide (76rem)` calendar/bulk composer; auth `max-w-sm` centered shell, no cards; descriptions `max-w-[68ch]`. The `88rem` composer shell: product-specific outlier — redesign must either fold it into `wide` or promote it to a named `composer` width with justification. No new widths without a decision entry.

## 14. Responsive contract

Radian breakpoints: `NOT CONFIRMED` beyond observed `sm/md/lg/xl` usage. Contract pins behavior, not values: sidebar desktop-rail ↔ mobile drawer (`md:`), tables/lists collapse (`md:`), composer 1→2 column + sticky rail (`lg:`, `xl:gap-8`), auth padding step (`p-4→md:p-8`), grids `sm:2col/lg:3col`, `EmptyContent` stack→row (`sm:`), calendar cells/dots swap (`sm:`), fixed mobile composer bar with safe-area padding. Confirm breakpoint tokens against registry before codifying.

## 15. Dark mode contract

Per-token light/dark pairs live in `globals.css :root/.dark` and `utility.css .dark`; contract aliases inherit via `var()`. **[ALIGNED]** dark verified complete for all canonical tokens (primary, success, error, warning, info via palette `.dark`, background, foreground, fills, border, focus, inverse, sidebar). `chart-*` removed (were unused; Radian publishes no chart tokens). Page-canvas `text-white` clusters (upload overlays, video rows, TikTok previews) intentionally untouched — product scope. Remaining raw `bg-black` (`sidebar.tsx:394` inverse-inset patch) kept — needs visual check at page stage.

## 16. Arbitrary values (KEEP / TOKENIZE / REMOVE — nothing removed now)

- TOKENIZE: `text-[13px]` (Badge/Input/Select duplicate), `text-[15px]` body-large, `text-[11px]` meta — fold into type scale (§3).
- KEEP: `max-w-[68ch]/[60ch]` measure, `min-w-[8rem]/36`, Radix-anchored `h-[var(--radix-…)]`, `max-w-[calc(100%-2rem)]`, grid templates, `rounded-[inherit]`, safe-area padding, `animate-[how-progress…]/[post-in…]`, toast `after:h-[calc(var(--gap)+1px)]`.
- REMOVE/DECIDE: `max-w-[88rem]` (see §13), `leading-[1.04]` hero, `shadow-[0_1px…]/[rgba…]` one-offs (fold into elevation), `text-[10px]` switch indicator, `fill-muted-foreground text-[10px]/[11px]` chart text.

## 17. Design principles (OpenCode rules, 10)

1. Prefer Radian component over custom implementation.
2. Prefer semantic token over raw color.
3. Prefer Radian variant over one-off class.
4. Do not invent new component variants without explicit requirement.
5. Do not use arbitrary values when an existing Radian token exists.
6. Do not bypass Radian composition patterns.
7. Do not visually redesign individual pages independently.
8. Same component must look and behave consistently everywhere.
9. Product-specific deviations must be documented.
10. Visual customization must happen through theme/tokens first.

## 18. Page redesign rules (patterns only, no design now)

- **Dashboard**: `PageContainer(default) + PageHeader(mb-6 variant noted) + PageSections(gap-8) + grid lg:3col + Card[size=sm] + divide-y lists`; empty via `EmptyBlock`, loading via skeletons, expired-accounts inline note.
- **Posts**: `PageHeader` + dual CTA + `Tabs mb-6` + toolbar (`flex-col→md:row`) + grid-table-or-Table + footer counts + load-more-or-pagination; row menu only via approved menu component.
- **Composer**: header + `Badge` count + `lg:2col [1fr_360px] xl:400px` + sticky rail + mobile drawer + fixed bar; terminal states via `PageContainer(narrow)+EmptyBlock`.
- **Calendar**: `PageContainer(wide) + PageHeader + month nav + 7-col grid + 280px drafts rail (xl:)`; overflow via Popover; dots on mobile.
- **Accounts**: `PageContainer(default) + quota line + sm:2col cards + per-platform rows + w-full→sm:auto CTAs`; disconnect via Dialog confirm.
- **Settings**: `PageContainer(narrow) + 5 Cards + FieldGroup + min-h-11 rows + DialogFooter`; danger card pattern fixed once.
- **Billing**: page only provides container/header/rhythm; widgets follow card/empty/loading rules.
- **Auth**: `AuthShell max-w-sm` only; `FieldGroup + Alert + Button w-full`; no cards, no page header.
- Density: keep current section rhythm; do not invent per-page densities during redesign.

## 19. Penpot contract (future structure)

`00_Cover / 01_Tokens / 02_Typography / 03_Colors / 04_Primitives / 05_Components / 06_Patterns / 07_Domain / 08_Reference`. Variables that must equal CSS after alignment: `primary*/success*/error*/warning*/info*` (+fg/text/border/hover/accent/focus), `bg/fill1-4/fg*/border*/soft/alpha/elevation-*`, `white/black-inverse`, `sidebar*`, `--radius*` + component radii, `--font-sans/heading/mono`, page widths + section gap, Button geometry, Sidebar widths, Card/overlay specs, empty/loading/error patterns, breakpoints. Penpot carries the same `NOT CONFIRMED` items until registry diff lands.

## 20. Final change matrix

| Area | Radian standard | Current PostVIA | Final direction | Source | Category |
|---|---|---|---|---|---|
| Token recipe | 0.3.8 colors doc | Canonical contract w/ documented gaps; `chart-*` removed | colors doc `fundamentals/colors.md`, `globals.css` | FOUNDATION |
| Primary/signal | `violet-blue` default | Indigo kept (brand); `signal` documented product alias | colors doc, skill §1 | FOUNDATION |
| Status hues/focus | Palette + semantic recipe | PostVIA Moss/Honey bases kept; `error` canonical; gray-ring + fill-collapse gaps documented, no invented values | colors doc, `globals.css` | FOUNDATION |
| Type/radius/elevation scales | Docs (H1-H6 numeric specs not published; radius per-component) | Pill removed; Geist Sans removed; DM Sans kept by decision | button/input/card/sidebar/typography docs | FOUNDATION |
| Button | Radian API + icon rule | Pill + `text-white` removed; legacy API maps kept (consumer scope) | button doc, `button.tsx` | COMPONENT |
| Card/inputs/select/sidebar/overlays | Stock shapes | 36-pill + `text-white` sweep done; Card `size`/title + widths kept (consumer scope) | `ui/*` | COMPONENT |
| Field/Toast | Visual parity only | Custom arch (kept) | Align visuals, no RHF/Sonner migration | `field.tsx`, `toast.tsx` | COMPONENT |
| Data UI | Table/DropdownMenu/Pagination | Custom grids + bare buttons + load-more | `DropdownMenu` installed + `PostRowMenu` migrated; table/load-more decided for page stage | skill mapping, `dropdown-menu.tsx` | PATTERN |
| Headers/toolbars/forms | PageHeader/Section/Tabs/Input/Select/Field compositions | Already single implementations (`PageHeader`, `Section`, `StatusTabs`, `DashboardPostFilter`, `Field*`) | **[ALIGNED patterns] verified canonical, no changes** (custom composer/month-nav/auth headers documented as variants) | pages audit | PATTERN |
| Status/empty/loading/error | Badge+Dot, Empty, Skeleton, Alert | Single implementations (`StatusBadge`, `StateBlock`) | **[ALIGNED patterns] verified canonical, no changes** (status tints kept as product dialect) | `StatusBadge.tsx`, `StateBlock.tsx` | PATTERN |
| Layout/shells | Blocks (signin/sidebar-*) | AppShell/PageContainer/Header/Section system | Codify narrow/default/wide; decide 88rem | skill §4, `layout/*` | PATTERN |
| Pages | Block patterns | Per-page shells (§18) | Apply patterns, no independent redesign | pages audit | PAGE |

## 21. Redesign order

1. FOUNDATION — **colors/tokens/radius/fg-sweep DONE** (this step). Remaining NOT CONFIRMED: Figma values, H1-H6 numeric specs, `heading-*/body-*` title utilities, hue-matched primary steps, distinct fill/fg steps.
2. COMPONENT — **primitives verified/aligned, Button wrapper KEPT by decision** (this step). Legacy-API migration is page scope.
3. COMPONENT / IMPORTANT — Card `size` prop (page scope), Sidebar trigger API (page scope), page-canvas `text-white`, `bg-black` inverse patch (page stage).
4. PATTERN — **DONE** (this step): `DropdownMenu` installed, `PostRowMenu` migrated, headers/toolbars/forms/cards/status/empty/loading/error/overlays verified canonical, table + pagination + density decisions recorded.
5. PAGE / IMPORTANT — composer, posts, calendar, accounts, settings, billing, auth in that dependency order.
6. PAGE / OPTIONAL — landing/marketing uniques, preview canvases, Penpot sync last.
