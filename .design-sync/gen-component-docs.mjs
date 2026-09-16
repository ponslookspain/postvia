// Generates one frontmatter-only doc stub per exported component so the
// Design System pane groups them instead of dumping all 171 into "general".
//
// Frontmatter-only is deliberate: package-build applies `category` from the
// frontmatter but only replaces the synthesized prompt body when the doc has
// a body — so a stub buys grouping while keeping each component's JSDoc,
// props table and examples intact. Re-run after adding a module to
// ds-entry.ts:  node .design-sync/gen-component-docs.mjs
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';

const GROUP_BY_MODULE = {
  'ui/button': 'actions',
  'ui/calendar': 'forms', 'ui/checkbox': 'forms', 'ui/field': 'forms',
  'ui/input': 'forms', 'ui/label': 'forms', 'ui/radio-group': 'forms',
  'ui/select': 'forms', 'ui/switch': 'forms', 'ui/text-area': 'forms',
  'ui/alert': 'feedback', 'ui/banner': 'feedback', 'ui/empty': 'feedback',
  'ui/progress': 'feedback', 'ui/skeleton': 'feedback', 'ui/spinner': 'feedback',
  'ui/toast': 'feedback', 'StateBlock': 'feedback',
  'ui/avatar': 'data-display', 'ui/badge': 'data-display', 'ui/card': 'data-display',
  'StatusBadge': 'data-display', 'PlatformIcon': 'data-display',
  'ui/dialog': 'overlays', 'ui/drawer': 'overlays', 'ui/dropdown-menu': 'overlays',
  'ui/popover': 'overlays', 'ui/tooltip': 'overlays',
  'ui/collapsible': 'navigation', 'ui/sidebar': 'navigation', 'ui/tabs': 'navigation',
  'ui/divider': 'layout', 'layout/PageContainer': 'layout', 'Section': 'layout',
  'PageHeader': 'layout', 'AuthShell': 'layout',
};

const OUT = '.design-sync/component-docs';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const modules = [
  ...readdirSync('src/components/ui').filter((f) => f.endsWith('.tsx')).map((f) => 'ui/' + f.replace(/\.tsx$/, '')),
  'layout/PageContainer', 'Section', 'PageHeader', 'StatusBadge', 'StateBlock', 'PlatformIcon', 'AuthShell',
];

const tally = {};
let n = 0;
const ungrouped = [];
for (const m of modules) {
  const group = GROUP_BY_MODULE[m];
  if (!group) { ungrouped.push(m); continue; }
  const s = readFileSync(`src/components/${m}.tsx`, 'utf8');
  const names = new Set();
  for (const g of s.matchAll(/export\s*\{([\s\S]*?)\}/g))
    g[1].split(',').map((x) => x.trim().split(/\s+as\s+/).pop().trim()).filter(Boolean).forEach((x) => names.add(x));
  for (const g of s.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g)) names.add(g[1]);
  for (const g of s.matchAll(/export\s+const\s+([A-Za-z0-9_]+)/g)) names.add(g[1]);
  for (const name of names) {
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) continue;
    writeFileSync(`${OUT}/${name}.md`, `---\ncategory: ${group}\n---\n`);
    tally[group] = (tally[group] || 0) + 1;
    n++;
  }
}
if (ungrouped.length) throw new Error(`no group mapped for: ${ungrouped.join(', ')}`);
console.log(`${n} doc stubs -> ${OUT}`);
console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([g, c]) => `${g}:${c}`).join('  '));
