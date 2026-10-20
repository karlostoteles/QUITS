// Builds the web app into public/ (served by the Worker as static assets).
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const r = (...p) => path.join(ROOT, ...p);
const OUT = r('public');
const SITE = process.env.SITE || 'https://quits.aircade.xyz';
const hash = buf => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

// empty public/ in place (the dev server watches the folder itself)
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
fs.mkdirSync(r('public/assets'), { recursive: true });
fs.mkdirSync(r('public/fonts'), { recursive: true });

// ---- fonts: self-hosted, Latin and Latin Extended only ----
const FONTS = [
  { family: 'Anybody', css: '@fontsource-variable/anybody/standard.css', match: /anybody-(latin|latin-ext)-standard-normal\.woff2/, preload: 'latin' },
  { family: 'Instrument Sans', css: '@fontsource-variable/instrument-sans/standard.css', match: /instrument-sans-(latin|latin-ext)-standard-normal\.woff2/, preload: 'latin' },
  { family: 'Martian Mono', css: '@fontsource-variable/martian-mono/standard.css', match: /martian-mono-(latin|latin-ext)-standard-normal\.woff2/ },
  { family: 'Doto', css: '@fontsource/doto/800.css', match: /doto-(latin|latin-ext)-800-normal\.woff2/ },
];
let fontCss = '';
const preload = [];
for (const f of FONTS) {
  const cssPath = r('node_modules', f.css), css = fs.readFileSync(cssPath, 'utf8');
  for (const block of css.match(/@font-face\s*{[^}]*}/g)) {
    const m = f.match.exec(block); if (!m) continue;
    const src = path.join(path.dirname(cssPath), 'files', m[0]), buf = fs.readFileSync(src);
    const name = m[0].replace('.woff2', `-${hash(buf)}.woff2`);
    fs.writeFileSync(r('public/fonts', name), buf);
    fontCss += block.replace(/font-family:[^;]+;/, `font-family:'${f.family}';`).replace(/src:[^;]+;/, `src:url(/fonts/${name}) format('woff2');`) + '\n';
    if (f.preload === m[1]) preload.push(`<link rel="preload" href="/fonts/${name}" as="font" type="font/woff2" crossorigin>`);
  }
}

// ---- css ----
const rawCss = fontCss + fs.readFileSync(r('src/web/style.base.css'), 'utf8') + '\n' + fs.readFileSync(r('src/web/style.app.css'), 'utf8');
const css = (await esbuild.transform(rawCss, { loader: 'css', minify: true, target: ['safari15', 'chrome100'] })).code;
const cssName = `app-${hash(css)}.css`;
fs.writeFileSync(r('public/assets', cssName), css);

// ---- js: the app, with the wallet code split off and loaded only when someone pays ----
const js = await esbuild.build({
  entryPoints: { main: r('src/web/main.js') },
  bundle: true, splitting: true, format: 'esm', platform: 'browser',
  outdir: r('public/assets'), entryNames: '[name]-[hash]', chunkNames: 'c-[hash]',
  minify: true, legalComments: 'none', target: ['es2020', 'safari15'],
  define: { 'process.env.NODE_ENV': '"production"', global: 'globalThis' },
  metafile: true, logLevel: 'warning',
});
const mainOut = Object.keys(js.metafile.outputs).find(k => js.metafile.outputs[k].entryPoint && js.metafile.outputs[k].entryPoint.endsWith('src/web/main.js'));
const mainName = path.basename(mainOut);

// ---- static files and the page ----
const STATIC = r('src/web/static');
if (fs.existsSync(STATIC)) for (const f of fs.readdirSync(STATIC)) fs.copyFileSync(path.join(STATIC, f), path.join(OUT, f));
const html = fs.readFileSync(r('src/web/index.html'), 'utf8')
  .replaceAll('%SITE%', SITE)
  .replace('<!--PRELOAD-->', preload.join('\n'))
  .replace('<!--CSS-->', `<link rel="stylesheet" href="/assets/${cssName}">`)
  .replace('<!--JS-->', `<script type="module" src="/assets/${mainName}"></script>`);
fs.writeFileSync(r('public/index.html'), html);
fs.writeFileSync(r('public/_headers'), `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/fonts/*\n  Cache-Control: public, max-age=31536000, immutable\n`);

// ---- report ----
const kb = n => (n / 1024).toFixed(0) + ' KB';
const outs = Object.entries(js.metafile.outputs).filter(([k]) => k.endsWith('.js')).map(([k, v]) => [path.basename(k), v.bytes]).sort((a, b) => b[1] - a[1]);
console.log(`css ${kb(css.length)} · fonts ${fs.readdirSync(r('public/fonts')).length} files`);
for (const [n, b] of outs.slice(0, 8)) console.log(`${n.padEnd(28)} ${kb(b)}`);
if (process.argv.includes('--meta')) fs.writeFileSync(r('meta.json'), JSON.stringify(js.metafile));
