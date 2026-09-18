// Harvests the app's real webfonts out of the Next build for /design-sync.
//
// next/font downloads Inter, DM Sans and Geist Mono at build time and emits
// one CSS chunk of @font-face rules pointing at hashed .woff2 files under
// .next/static/media. The preview environment does not run next/font, so
// without this step every card renders in Arial. Re-run after `npm run build`
// (the chunk filename is content-hashed, so it is discovered, not pinned).
//
//   node .design-sync/harvest-fonts.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHUNKS = '.next/static/chunks';
const MEDIA = '.next/static/media';
const OUT = '.design-sync/fonts';

const src = readdirSync(CHUNKS)
  .filter((f) => f.endsWith('.css'))
  .map((f) => join(CHUNKS, f))
  .find((p) => readFileSync(p, 'utf8').includes('@font-face'));
if (!src) throw new Error(`no @font-face chunk under ${CHUNKS} — run \`npm run build\` first`);

const css = readFileSync(src, 'utf8');
const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);
if (!faces.length) throw new Error(`no @font-face rules parsed out of ${src}`);

mkdirSync(OUT, { recursive: true });
const copied = new Set();
const rules = faces.map((rule) =>
  rule.replace(/url\(\.\.\/media\/([^)]+)\)/g, (_, file) => {
    if (!copied.has(file)) {
      copyFileSync(join(MEDIA, file), join(OUT, file));
      copied.add(file);
    }
    return `url(./${file})`;
  }),
);

writeFileSync(
  join(OUT, 'ds-fonts.css'),
  '/* Harvested from the Next build by .design-sync/harvest-fonts.mjs.\n' +
    '   Do not hand-edit — regenerate after `npm run build`.\n' +
    `   Source chunk: ${src} */\n` +
    rules.join('\n') +
    '\n',
);
const families = [...new Set(faces.map((r) => /font-family:\s*([^;}]+)/.exec(r)?.[1].trim()))];
console.log(`${faces.length} @font-face rules, ${copied.size} woff2 copied -> ${OUT}`);
console.log(`families: ${families.join(', ')}`);
