# design-sync notes — postvia

Repo-specific gotchas for future syncs. Read this before running anything.

## What this repo is

A private Next.js **application**, not a published component library: no
`dist/`, no `exports`, no `main`, `"private": true`. Everything below exists
to give the converter the package-shaped inputs it expects.

## The four pre-build steps (all in `cfg.buildCmd`, in this order)

```
npm run build                                   # produces the compiled CSS + fonts
node .design-sync/compile-css.mjs               # Tailwind -> .design-sync/.cache/postvia.css
node .design-sync/harvest-fonts.mjs             # next/font woff2 -> .design-sync/fonts/
npx tsc -p .design-sync/tsconfig.ds.json        # .d.ts tree -> dist/types/
node .design-sync/gen-component-docs.mjs        # grouping stubs -> .design-sync/component-docs/
```

- **`.design-sync/ds-entry.ts`** is the design system's public surface — a
  hand-maintained barrel, passed as `--entry`. Nothing in the app imports it.
  Adding a module there adds it to the sync; re-run `gen-component-docs.mjs`
  afterwards (it will throw if the new module has no group mapped).
- **`index.d.ts` at the repo root** (gitignored, written by hand once) is
  required and easy to lose: `lib/dts.mjs` `projectFor()` computes the types
  entry as `pkgJson.types || pkgJson.typings || 'index.d.ts'` under the
  package dir — it ignores the types *root* it was handed. Without that file
  every `<Name>.d.ts` ships with empty props. It is one line:
  `export * from "./dist/types/.design-sync/ds-entry";`
  Recreate it on a fresh clone.
- `dist/types/` and the root `index.d.ts` are gitignored build output.

## ⚠️ Recompile the CSS *after* authoring previews

`compile-css.mjs` runs Tailwind over `.design-sync/tailwind-entry.css`, whose
`@source` globs cover both `src/**` and `.design-sync/previews/**`. The scan
happens at **compile time**, so a utility class that appears only in a preview
file is missing from the stylesheet until the CSS is recompiled.

This fails silently and looks like a component bug. It cost one debugging
cycle already: `Card.tsx`'s `border-primary/40` was in the element's class
list and computed to the *default* border colour, because the class had never
been emitted.

**Rule: after any wave of preview authoring, run `compile-css.mjs` before
`package-build.mjs`.** Subagents cannot do this (they may only run
`preview-rebuild.mjs` + `package-capture.mjs`), so it is an orchestrator step
between waves.

## Browser for the render check

No playwright browser cache on this machine, but Google Chrome is installed.
Both `package-validate.mjs` and `package-capture.mjs` honour `DS_CHROMIUM_PATH`:

```
DS_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
  node .ds-sync/package-validate.mjs ./ds-bundle
```

Only the `playwright` npm package is needed in `.ds-sync/` — **do not** run
`npx playwright install chromium` (~200 MB) unless system Chrome disappears.

## Fonts

`next/font` fetches Inter, DM Sans and Geist Mono at build time and emits one
content-hashed CSS chunk under `.next/static/chunks/` plus hashed `.woff2`
under `.next/static/media/`. `harvest-fonts.mjs` discovers that chunk by
content (never by filename — the hash changes every build) and copies the 15
woff2 with rewritten `url()`s.

next/font also emits metric-override faces (`"Inter Fallback"`,
`src: local(Arial)`) that ship no file. The converter's font scraper only
carries faces with a `url()`, so referencing one dangles and fires
`[FONT_MISSING]`. `tailwind-entry.css` therefore declares the `--font-*`
chains with **generic** tails instead of those aliases. The real woff2 are
served from the bundle and paint immediately, so the metric-override trick has
nothing to do. Do not "restore" the aliases.

## Grouping

**Resolved — the manifest now carries real groups.** The problem this solves:
the package shape derives a component's group from its source directory, and
`ui/`, `components/` and `src/` are all in the converter's generic-dir list, so
on the first build all 171 components landed in one flat `general` group.
`gen-component-docs.mjs`
writes a **frontmatter-only** `<Name>.md` per component into
`.design-sync/component-docs/` (bound via `cfg.docsDir`). Frontmatter-only is
load-bearing: `package-build.mjs` applies `category` regardless of body, but
only *replaces* the synthesized prompt body when the doc has one — so a stub
buys grouping while each component keeps its JSDoc, props table and examples.
Adding a body to those stubs would silently delete the props table.

## Known render warns (triaged, not new)

- `[TOKENS_MISSING] --toast-index, --toast-swipe-movement-x,
  --toast-swipe-movement-y, --toast-height, --toast-offset-y` — set at runtime
  by `ui/toast.tsx` via inline style. Expected to be absent from a static
  stylesheet; the validator's own message says so.

## Theme

The app is **dark by default** — `src/hooks/use-theme.ts` sets `.dark` on
`<html>` from a blocking script. That script does not run in the preview
environment, so **every card renders in the light theme**. Both themes are
fully defined in `src/app/design-system/semantic.css`, and the `dark` variant
is `&:is(.dark *)`, so a wrapper element with `class="dark"` themes its whole
subtree. There is no DS export that renders such a wrapper, and inventing one
would mean shipping a component the product does not have, so previews are
left theme-neutral (no explicit background) and the conventions header carries
the instruction instead.

## Excluded from the design system

`ds-entry.ts` deliberately omits `AppShell`, the product `Sidebar`,
`MobileTopBar`, `LegalSection`, `GoogleButton`, and all of `landing/*` and
`billing/*`. They import `next/navigation`, `next/link` or prisma-backed
`@/lib/auth`, and they are page content rather than design system. Note the
name collision this avoids: `ui/sidebar.tsx` exports the `Sidebar` *primitive*,
which **is** synced.

`guidelinesGlob` is pinned to `docs/design-system.md` + `docs/design-tokens.md`.
The default glob swept in 19 engineering docs (auth, billing, database,
deployment, environment…) — not design guidance, and not something to publish
into a design project.

## ⚠️ A component-source change does NOT clear its grade

The single most dangerous trap in this setup. `sourceKeyFor()`
(`lib/sync-hashes.mjs`) builds the grade key from three things: the global
config slice, the per-component config slice, and the authored preview file
`.design-sync/previews/<Name>.tsx`. A component's own source reaches the key
through `srcSha` — but `package-build.mjs` passes it **only for the storybook
shape**:

```js
...(shape === 'storybook' ? { stories: ..., srcSha: c.srcSha ?? null } : {})
```

We are the `package` shape. So editing `src/components/ui/<name>.tsx` changes
what the card renders while the grade key stays identical: `package-capture`
prints `carried forward`, and a verdict that no longer describes the bundle
ships to the project. Silently. Nothing warns.

**Rule: after any change to a synced component's source, force fresh verdicts
for the affected components and re-read their sheets.**

```
DS_CHROMIUM_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"   node .ds-sync/package-capture.mjs --out ./ds-bundle --components A,B --force
```

Only components with an authored preview are at risk — floor-card components
carry no grade to go stale. Map a source file to its authored previews before
deciding the `--components` list; one source file can back several
(`StateBlock.tsx` backs `LoadingBlock`, `ErrorBlock` and `EmptyBlock`).

Config edits and preview edits DO clear grades correctly, as does an explicit
`ov.viewport`. Styling, bundle and pipeline churn deliberately do not.

## Repo scripts the sync had to touch

`eslint.config.mjs` ignores `ds-bundle/`, `dist/`, `.ds-sync/`, `index.d.ts`,
`.design-sync/` and `.claude/`. Without the first four, `npm run lint` reports
~16k problems from generated output; without `.claude/`, every background-task
worktree (a full second checkout) gets linted as well. `.design-sync/previews`
is excluded on purpose: its literal quotes are content (`size="32"` captions),
which Next's app ruleset flags as `react/no-unescaped-entities`.

`npm run typecheck` does cover `.design-sync/ds-entry.ts` (tsconfig includes
`**/*.ts`), which is desirable — it is what catches a barrel that drifts from
the components it re-exports.

## Re-sync risks

- **The font chunk is discovered by content, but the woff2 are copied by
  hash-name.** After any `npm run build`, re-run `harvest-fonts.mjs`; stale
  files in `.design-sync/fonts/` are not pruned automatically.
- **`index.d.ts` and `dist/types/` are gitignored.** A fresh clone has neither,
  and the failure is silent: the build succeeds and every `.d.ts` ships with
  empty props. Always run the full `buildCmd` before trusting a re-sync.
- **The barrel drifts.** A component added to `src/components/ui/` is NOT
  synced until it is added to `ds-entry.ts` (the ui glob there is generated at
  authoring time, not at build time). Re-run `gen-component-docs.mjs` after
  editing the barrel — it throws on an unmapped module, which is the guard.
- **Preview CSS coupling** (see the recompile rule above) — the single most
  likely cause of a "component looks unstyled" report.
- **`@/` path aliases** resolve through two different configs: `cfg.tsconfig`
  (repo `tsconfig.json`) for esbuild, and `.design-sync/tsconfig.ds.json`
  (which redefines `paths` as `../src/*` because it lives one directory down)
  for tsc. Changing one without the other breaks half the pipeline.
- Chrome is a moving target: the render check drives the **system** Chrome, not
  a pinned chromium. A major Chrome update could change screenshot output
  enough to re-grade cells. Not seen yet.

## Component-authoring learnings (wave 1: overlays, forms, feedback)

Folded from `.design-sync/learnings/{overlays,forms,feedback}.md`, which were
deleted after folding. These cost real iterations — read before authoring more.

### Two size APIs are live at once, and mixing them fails silently

`Button` takes the **legacy PostVIA** API (`variant: default | secondary |
outline | ghost | destructive | link`, `size: default | xs | sm | lg | icon |
icon-xs | icon-sm | icon-lg`). `SelectTrigger`, `Badge`, `Avatar` and `Input`
take the **Radian numeric** scale (`size="28|32|36|40|44|48"`). Passing one
API's value to the other component drops every size class with no error: cva
finds no matching variant, and `defaultVariants` only fill a prop that is
`undefined`, not one that is set to an unknown value. This is the single most
important thing for the conventions header to say.

Per-component scales are not interchangeable either:
`Input` "28"–"48" (default "36") · `Switch` "20"|"24"|"32" (default "24") ·
`Checkbox` / `RadioGroup` `sm|md|lg` (default `md`) · `TextArea` has **no**
size axis (its axes are `rows`, `rounded`, `resizable`).

### Preview scaffolding: inline styles, not utility classes

All three agents independently converged on this and it is now the house rule.
Wrappers use inline `style={{ … }}`; DS components are styled through props.
It sidesteps the CSS-recompile trap above entirely, and for `Skeleton` /
`Progress` an inline size also cleanly outranks the component's own `h-1.5
w-full` defaults without involving tailwind-merge. Where a caption needs a
token colour, `var(--color-muted-foreground)` (canonical, `semantic.css`)
resolves in the preview environment — no recompile needed. (Previews used to
reference `var(--color-fg-tertiary)` from the now-removed `compat-radian.css`;
all were migrated to canonical `--color-*` names when that file was deleted.)

### Static-render gotchas

- **Open-state props are not uniform.** `Dialog` / `Popover` / `Tooltip` take
  `open` (no `onOpenChange`); `DropdownMenu` / `Select` roots take
  `defaultOpen`; **`DropdownMenuSub` ignores `defaultOpen`** and needs
  controlled `open`.
- **`PopoverContent` autofocuses its first child** and the `focus-visible` ring
  lands in the screenshot — a `ghost` button then reads as `outline`, i.e. the
  card lies about the variant. Use
  `onOpenAutoFocus={(e) => e.preventDefault()}`. `Dialog` does not need it.
- **Keycap glyphs tofu** in the bundled Inter subset (`⏎` in
  `DropdownMenuShortcut`). Use ASCII.
- **`Calendar` cells must pin `month` *and* `today`** — `defaultMonth` alone
  leaves the today-ring floating relative to the capture date.
- **`Switch shape="square"` is invisible at the default size**: `rounded-md` on
  a 24px track still reads as a pill. Demo it at `size="32"`.
- **Toasts seeded through an external `createToastManager()` silently vanish**
  — `ToastProvider` subscribes in its own effect, which runs after children's
  effects. Seed via `useToastManager().add`. A collapsed stack also needs
  `ToastContent` pinned to `opacity: 1` (`data-behind:opacity-0`).

### Overlays need `cardMode: "single"`

All six (`Dialog`, `Drawer`, `DropdownMenu`, `Popover`, `Tooltip`, `Select`)
portal to `document.body` with `position: fixed`, so in grid mode their content
escapes the cell and stacks in one corner. Applied in `cfg.overrides`. The
per-cell `?story=` capture was always correct — the override is for the
product's default card render.

## Findings about the product (not the sync)

Recorded here because a future sync will re-discover them.

- **`Alert` is composed wrongly at every call site.** The root is `flex
  items-stretch`; `AlertContent` is the `flex-col` stacker. App code renders
  `<Alert><Icon/><AlertTitle/><AlertDescription/></Alert>`, which lays title and
  description **side by side**. Verified by rendering both compositions from the
  built bundle. Affects `src/app/login/LoginForm.tsx` (5 alerts),
  `src/app/onboarding/OnboardingForm.tsx`, `src/app/accounts/AccountsContent.tsx`.
  Filed as a separate task; `src/` was not touched by the sync.
- **`ToastIcon` is not exported** from `ui/toast.tsx`, so Toast cannot be fully
  composed from outside the module. Previews substitute a coloured dot.
- **Not a bug:** in `Calendar`, a trailing outside day that happens to be
  *today* picks up the crimson today marker while its neighbours stay muted.
  That is `group-data-today:border-primary group-data-today:text-primary-text`
  applying regardless of outside status — intended, and deterministic once the
  preview pins `today`.

## Component-authoring learnings (wave 2: data-display, navigation, layout)

Folded from `.design-sync/learnings/{data-display,navigation,layout}.md`,
deleted after folding.

### `lucide-react@1.45.0` ships no brand icons

`InstagramIcon`, `LinkedinIcon`, `YoutubeIcon` and the whole brand set are
gone. The failure is a hard esbuild error at preview-rebuild time
(`No matching export ... for import "InstagramIcon"`), which costs a full
rebuild cycle. A social-media product tempts every author toward exactly these
names. **Use `PlatformIcon`** — it exists for this and ships X, Threads,
TikTok, Instagram and a generic fallback as Simple-Icons paths on one 24px
grid. Generic lucide stand-ins (`AtSignIcon`, `VideoIcon`, `ClapperboardIcon`)
are the fallback for non-platform concepts.

### `className`-only components break the inline-style house rule

`PlatformIcon`'s entire signature is `{ platform, className }` — **no `style`
prop**. Its `size-4` default is baked in and merged through `cn()`, and
wrapping it in an inline-sized span does not help (the svg keeps its own
`size-4`). Sizing it therefore requires a `size-*` utility class. The four used
(`size-4/5/6/8`) all already appear in `src/`, so the scan keeps emitting them.
The general shape — a component exposing `className` but not `style` — will
recur; check the signature before assuming inline styles are available.

### `muted` and `accent` are the same colour in the light theme

`--accent` is a plain alias of `--muted` (`semantic.css`: `--accent: var(--muted)`).
So anything `bg-accent` on a `bg-muted` surface is **invisible**, with no
error. `Skeleton` is `bg-accent` — a skeleton stack on a `muted` panel
photographs as an empty grey box.

**This is pre-existing, not something the token refactor (or the later
Radian-naming removal) introduced**: `--muted` and `--accent` have always
held the same `oklch(0.97 0 0)` in light theme; only the name on top of them
changed (`fill1`/`fill2` → `muted`/`accent`, when `compat-radian.css` was
removed). It is the documented `muted`/`accent` collapse (`docs/design-tokens.md`,
"Radian removal" §3) meeting a real component. Authors: put `Skeleton` on
`--color-background`, or inside a real `Sidebar` where `--color-sidebar` (`0.985`) is a
shade lighter and it just reads.

### `Sidebar` geometry in a capture

- The desktop rail is `position: fixed` (`h-svh w-(--sidebar-width)`), so it
  escapes a grid cell. The `?story=` capture survives only because `.ds-single`
  sets `transform: translateZ(0)`, making it the containing block. Hence
  `cfg.overrides.Sidebar.cardMode = "single"`.
- **`h-svh` resolves to the full capture viewport**, pushing `SidebarFooter`
  below the fold. Pass an explicit `height`: `Sidebar` spreads rest props onto
  the element carrying `h-svh`; `SidebarInset` spreads onto its `<main>`, which
  in `variant="inset"` carries `md:m-2 md:ml-0` (8px top and bottom) — give it
  `height - 16`.
- `collapsible="none"` is the easy path for rail-only cells: a plain `sticky`
  div, no fixed container, no mobile Drawer branch.
- The rail is `hidden md:block` and `useIsMobile()` reads `innerWidth < 768`.
  The 900px capture viewport clears both; **any card declaring a viewport
  narrower than 768 renders the mobile Drawer instead.**
- `SidebarProvider` takes both `defaultOpen` and `open`; use `open` for a
  static capture.

### More per-component size scales

Extending the wave-1 list: `SidebarMenuButton` `size="28|32|36|48|52|56"`
(default `"32"`), `variant="neutral|soft|strong"` (default `"neutral"`);
`SidebarMenuSubButton` `size="28|32"` only; `SidebarInput` hard-codes
`size="32"` on its underlying `Input` and **ignores any size passed**.

### `class`-passing props are a preview trap

`LoadingBlock`'s `rowClassName` takes a utility string. Any value not already
present in `src/` is silently absent from the stylesheet, and a skeleton row
with no height class collapses to a 0px line — indistinguishable from a broken
component. Curate such values from real call sites; never invent one.

### Avatar sub-part positioning

`AvatarIndicator` / `AvatarStatus` are `absolute` with **no offsets** — the
caller positions them, and `right: 0; bottom: 0` puts the pip outside the
circle (the bounding box corner is off the arc). Inset by roughly `size × 0.1`.
`rounded="square"` is invisible below ~48px (`--radius` is 14px, so a 40px box
is nearly a circle) — demo it at `size="64"`. `AvatarGroup` overlaps a fixed
8px regardless of child size, clipping two-letter initials; centred glyph
children survive it.

### Misc capture facts

- Backticks in caption prose render **literally** in a screenshot. Use quotes.
- `var(--border)`, `var(--muted)`, `var(--color-fill2)` and
  `var(--color-fg-tertiary)` all resolve in the preview environment, so
  hairline rules and captions need no utility classes.
- No cell may reference a remote image — the capture is offline. `AvatarImage`
  is deliberately not demonstrated; a dangling `src` falls through to the
  fallback and quietly misrepresents the component.

### A design-system contradiction worth a decision

`SidebarMenuButton`'s `soft` and `strong` variants put `--primary` on the
**active** nav row, which contradicts the normative rule in
`docs/design-system.md` ("the active one is a quiet neutral fill, never the
brand hue — the red is for actions"). The product is correct (it uses the
default `neutral`), but the variants exist in the primitive. Either the rule or
the variants should give way; the preview shows both so the contradiction is
visible rather than buried in a cva config.

### `ErrorBlock` carries the `Alert` composition bug into the design system

`src/components/StateBlock.tsx` omits `AlertContent`, so every `ErrorBlock`
renders its title and description side by side. Unlike the app-level call
sites, this one is a **component the design system exports**, with 16 usages
across 8 files including every route's `error.tsx` boundary. It cannot be
fixed from a preview (`ErrorBlock` exposes only `title`/`description`/
`action`), so those cells are graded `good` — they are the component's real
behaviour — with the cause recorded in the grade notes. `AuthShell`'s
`SignInFailed` cell composes the same alert *with* `AlertContent` on an
adjacent sheet, so the diff is visible in the bundle. Filed as a task.
- **A component-source change does not clear its grade** (see the section
  above). This is the failure mode most likely to ship a wrong verdict, and it
  will recur on every component fix.
