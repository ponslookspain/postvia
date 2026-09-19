# Graphify Architecture Audit — `dev` @ `d5a9b1c`

Audit-only stage. No UI, product, cron, schema, or behavior changes.
No refactor performed. No Graphify CI added.

## 1. Graphify setup

| Item | Finding |
|---|---|
| Install | `uv tool graphifyy v0.9.63` (`graphify.exe` in `~/.local/bin`). Not pip. Version pinned at `.opencode/skills/graphify/.graphify_version` = `0.9.63`. |
| Launch | Skill `.opencode/skills/graphify/SKILL.md` + `references/` (8 files). No repo config file (`graphify.config.*` absent — skill-driven). This audit used the manual AST pipeline (`detect → extract → build → cluster → analyze`), code-only. |
| Update CLI | `graphify update <path>` (incremental, no LLM). Not used here — full fresh rebuild was required. |
| Generated files | `graphify-out/graph.json`, `GRAPH_REPORT.md`, `graph.html`, `manifest.json`, `.graphify_labels.json`, cache/. No `.graphify_python` was present before this audit (re-resolved via uv). |
| `graphify-out/` status | Generated artifact, **partially tracked**: `.gitignore` ignores only `cost.json`, `cache/`, `.graphify_root`. `graph.json` / `GRAPH_REPORT.md` / `manifest.json` / `graph.html` are committed. |
| Auto-run (hooks) | **Installed locally** (`graphify hook status`: `post-commit: installed`, `post-checkout: installed`, `merge driver: registered`). Scripts live in `.git/hooks/` (untracked, machine-local — installed 2026-09-18 via `graphify hook install`, pinned interpreter = uv `graphifyy` python). `post-commit`: after every commit touching non-`graphify-out/` files, launches a **detached background code-only rebuild** (no LLM, log `~/.cache/graphify-rebuild.log`); commit returns immediately. Skips rebase/merge/cherry-pick, `GRAPHIFY_SKIP_HOOK=1`, linked worktrees, and commits touching only `graphify-out/*` (anti-loop guard). `post-checkout`: full rebuild on branch switches only (output dir must exist). Merge driver: untracked root `.gitattributes` maps `graphify-out/graph.json merge=graphify` (union merge via uv python). No CI step (`.github/workflows/ci.yml` has no graphify job — verified). Session reminder plugin (`.opencode/plugins/graphify.js`) is separate. Existing config was sufficient; nothing new added. |

## 2. HEAD vs working-tree state (read carefully)

The graph was built from a **clean temporary worktree** at exactly:

* Commit: `d5a9b1c333ebb2372506b28d27cbffbc7d2c28a3` (`dev`, `feat(dashboard): add gated query timing…`)
* Worktree: detached HEAD, `git status` clean — **zero uncommitted application changes included in the graph**.
* Main worktree was never stashed, never overwritten.

Why a worktree was mandatory — three different states existed:

| State | Graph claim | Trust |
|---|---|---|
| Committed `graphify-out/` at HEAD | `Built from commit: 38fce077`, 2949 nodes / 8254 edges | STALE (two+ commits behind HEAD) |
| Dirty main worktree `graphify-out/` | `d5a9b1c3`, 4584 nodes / 10809 edges, 7 files modified + untracked `2026-09-18/` snapshot | Unverifiable as a HEAD artifact — local rebuild mixed with uncommitted `.opencode/opencode.json` (`$schema` line) and label churn. **Origin identified (Stage 11 correction): the installed `post-commit` hook rewrites `graphify-out/` in the background after every commit and writes its own `2026-09-18/`-style backups** (`[graphify] backed up curated graph (5 files)` in `~/.cache/graphify-rebuild.log`), so tracked-graph dirt reappears on its own. Any freshness claim about the working tree must be re-checked after the hook settles. |
| **Fresh rebuild in clean worktree (this audit)** | **HEAD `d5a9b1c`, 3802 nodes / 9862 edges / 241 communities, code-only AST** | **Authoritative** |

Fresh-build corpus: 615 files (458 code, 157 docs), ~954k words. Scope note: semantic
(doc) extraction skipped (no `GEMINI_API_KEY`; host-LLM extraction of 157 docs is
disproportionate for an import-boundary audit). AST covers 100% of the dependency
surface this audit checks. Communities therefore unlabeled, no `graph.html` regenerated,
no manifest stamped — sufficient for this stage, recorded as a limitation.

Fresh-graph health (read-only diagnostic): 0 missing-endpoint edges, 694 dangling-endpoint
edges (external/unresolved symbols — normal for AST graphs), 10 self-loops, raw
10224 → post-build 9862 edges. 2 files had parser syntax warnings with partial extraction:
`src/lib/http-range.ts`, `src/lib/plans.ts` (both are thin re-export/utility modules;
boundaries verified by direct import inspection instead).

For the record — main-worktree dirt at audit time (all unrelated to `src/`):
`M .opencode/opencode.json`, `M graphify-out/{graph.json, GRAPH_REPORT.md, manifest.json,
graph.html, .graphify_labels.json(.sig)}`, `?? .claude/`, `?? .gitattributes`,
`?? graphify-out/2026-09-18/`. `src/` itself is identical between HEAD and the dirty tree.

## 3. Potential problems found: 3 (all dispositioned below, 0 real)

## 4. Real architectural violations: none

All 10 boundary rules PASS on the clean HEAD graph (Graphify traversal + direct import
inspection in the clean worktree):

1. `src/domain` ↛ `src/app` — 0 hits. PASS.
2. Domain/business logic ↛ UI components — 0 `@/components`, 0 `"use client"` in `src/domain`. PASS.
3. Server/infra ↛ client-only — 0 `lucide-react` / `"use client"` in `src/lib`; only server-side `next/headers|next/navigation` + `react/cache`. PASS.
4. UI/routing not a logic source — `src/app` (~100+ `@/lib/` imports) and `src/components`
   (59 `@/lib/` hits) consume via lib; **zero direct `@/domain/` imports** from app/components. PASS.
5. Publishing ↛ app routes — `src/lib/publish*.ts` imports lib-only. PASS.
6. Scheduling ↛ presentation — `src/lib/schedul*.ts`, `scheduling/recover-stale.ts`, `bulk-schedule.ts` import lib-only. PASS.
7. Capabilities single source of truth — canonical `src/domain/social/capabilities.ts`; lib copy is a pure re-export shim (see §6). PASS.
8. Shared infra ↛ consumers — `dashboard-types.ts`, `*-types.ts` live in lib; direction always `app → lib`. PASS.
9. Circular dependencies — fresh graph `Import Cycles: None detected`. PASS.
10. No new back-edges — shortest path `getPlatformCapabilities() → getEffectiveMediaConstraints() → NewPostComposer()` is 2 forward hops (`lib → lib → app`); reverse traversal of the shim shows only `app|lib|tests → shim` edges, never `domain → app`. PASS.

Per-rule template (`Rule / Current dependency / Why / Files / Fix / Priority`): not
instantiated — there is no real violation to file it against.

## 5. False positives: 2

1. `src/lib/dashboard-types.ts:5-6` matches `src/app` — doc comment explicitly stating
   `lib` does **not** depend on `src/app/**`. Comment, not an import. FALSE POSITIVE.
2. Fresh-graph “Surprising Connections” (`LoginForm/SignupForm → scripts/e2e-otp-check.ts`,
   all INFERRED, confidence ~0.84) — name-collision inference between UI handlers and a
   scratch script. No import exists. FALSE POSITIVE.

## 6. Compatibility dependencies: capabilities shim (keep)

`src/lib/platforms/capabilities.ts:1-9` — pure `export * from "@/domain/social/capabilities"`. No behavior. Still needed.

| Consumer layer | Files (HEAD) |
|---|---|
| `src/lib` (4, legacy) | `bulk-schedule.ts:12`, `composer-media.ts:4`, `composer-previews.ts:2-5`, `publish.ts:53` |
| `src/app` (9, via shim) | `accounts/AccountsContent.tsx:39`, `api/accounts/route.ts:4`, `api/posts/[id]/route.ts:9`, `posts/bulk/BulkScheduler.tsx:35`, `posts/bulk/page.tsx:3`, `posts/new/_components/ChannelStrip.tsx:28`, `posts/new/page.tsx:3`, `posts/PostsList.tsx:26`, + `cross-platform-publishing` page |
| `tests` (4+) | `media.test.ts`, `multi-target.test.ts`, `platform-capabilities.test.ts`, `provider-dispatch.test.ts`, `instagram.test.ts` |
| Canonical `@/domain/social/capabilities` direct users | 0 — migration not started |

Assessment: all shim edges point the right way (`app|lib|tests → shim → domain`).
Migration path is safe and gradual (one import line per file, zero behavior change), but
**do not delete the shim** until consumers reach zero. No action taken in this stage
(audit-only). Related shims observed (same pattern, not in scope to change):
`lib/platforms/overrides.ts`, `lib/social/{provider,pkce}.ts` (pure); `lib/social/{x,threads,tiktok,instagram}.ts` (hybrid: policy re-export + runtime OAuth/refresh clients correctly kept in lib); `lib/platforms/providers.ts` (real logic: `PlatformDispatch`, `getDispatchEntry`).

## 7. Circular dependencies

None. Fresh HEAD graph: `Import Cycles: None detected` (241 communities, god nodes
`cn()` 223, `reportError()` 92, `getApiUser()` 71 — all expected hubs, no cycle).

## 8. Recommendations

1. **Migrate the 4 legacy lib imports** (`bulk-schedule`, `composer-media`, `composer-previews`, `publish`) to `@/domain/social/capabilities` — 4 one-line changes, low risk, good first follow-up. Keep the shim until app + test consumers also migrate. Priority: low.
2. **Decide the fate of the tracked graph — the hook makes “tracked + stale” self-perpetuating.** The installed `post-commit` hook rewrites `graphify-out/` after every commit and drops its own `2026-09-18/`-style backups, so tracked-graph dirt (`graph.json`, `graph.html`, `GRAPH_REPORT.md`, `manifest.json`, labels) reappears without any human action — this audit’s fresh HEAD graph already differs from the committed stale one by ~850 nodes, and the hook re-dirtied the tree again right after the audit commit. Either “tracked + fresh” (let the hook own it, review its diffs) or “untracked + on-demand” (extend `.gitignore` to the generated outputs, keep the hook for local use only). Priority: low.
3. **Fix or document the AST parser warnings** for `src/lib/http-range.ts` / `src/lib/plans.ts` (line-10 syntax errors, partial extraction). Cosmetic for boundaries, but they shrink graph coverage. Priority: low.
4. No domain-module creation, no layer changes, no CI wiring justified by these findings.

## 9. Decision

**`KEEP AS MANUAL ARCHITECTURE TOOL`**

Graphify earned its keep in this audit: it proved the committed graph was stale
(`38fce077` vs HEAD `d5a9b1c`), gave a clean-room rebuild (3802 nodes / 9862 edges),
independently confirmed zero import cycles, and its reverse traversal enumerated every
shim consumer without hand-grepping. But the signal is periodic, not per-PR: boundaries
are currently clean, the graph is expensive to keep fresh (615 files, multi-MB artifacts),
and AST-only runs leave communities unlabeled. The installed local hooks already provide
freshness where it matters (background rebuild on commit/branch-switch, union merge driver
for `graph.json`) without gating anyone’s pipeline — that automation stays local-only.
Revisit CI only if (a) real violations start appearing, or (b) someone owns graph freshness.
CI integration is intentionally NOT recommended. Do not add to CI now.

## Validation

* Graph provenance: clean detached worktree @ `d5a9b1c`, `git status` clean before/after rebuild; main tree untouched (no stash).
* Graphify self-checks: build guard passed (non-empty), health diagnostic recorded above, `god-nodes`/`query`/`path`/`affected` traversals all ran against the fresh `graph.json`.
* App validation: docs-only change (`docs/graphify-architecture.md` added; fresh graph artifacts
  intentionally **not** copied back — they live in the throwaway worktree). `npm run typecheck`
  confirms the repo baseline is unaffected by this stage.
* Checked: HEAD-vs-dirty separation, 10 boundary rules, shim consumer census (HEAD), cycles, false positives.
* Found: 0 real violations, 2 false positives, 1 compatibility shim (keep), 0 cycles.
* Hook correction (Stage 11): the report originally stated no hooks were installed — wrong.
  Local hooks ARE installed (`post-commit` + `post-checkout` + `graph.json` merge driver);
  the `post-commit` hook was observed firing after the audit commit (background rebuild,
  `~/.cache/graphify-rebuild.log`). §1, §2 and §8 corrected; verdict unchanged.
* Graphify verdict: keep as manual tool; CI integration intentionally NOT recommended.
