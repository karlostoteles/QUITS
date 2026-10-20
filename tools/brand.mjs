// Renders the app icons and the link preview image from the app's own CSS (run after a build: node tools/brand.mjs).
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(ROOT, 'public/assets', fs.readdirSync(path.join(ROOT, 'public/assets')).find(f => f.endsWith('.css'))), 'utf8')
  .replaceAll('url(/fonts/', `url(file://${ROOT}/public/fonts/`);
const OUT = path.join(ROOT, 'src/web/static');
const INK = `<svg width="0" height="0" style="position:absolute"><defs><filter id="q-ink" x="-6%" y="-6%" width="112%" height="112%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="1" seed="4" result="fine"/><feDisplacementMap in="SourceGraphic" in2="fine" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="rough"/><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="12" result="blot"/><feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -2.6 0 0 0 2.05" result="mask"/><feComposite in="rough" in2="mask" operator="in"/></filter></defs></svg>`;
const page = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{height:auto;overflow:visible;background:transparent}${extra}</style></head><body>${INK}${body}</body></html>`;

// icon: the highlighter swipe and a q
const icon = size => page(`<div class="ic-wrap"><div class="ic-hl"></div><span class="ic-q">q</span></div>`, `
.ic-wrap{position:relative;width:${size}px;height:${size}px;background:#0A0F20;overflow:hidden;display:grid;place-items:center}
.ic-hl{position:absolute;left:18%;right:18%;top:27%;bottom:25%;background:var(--yellow);border-radius:${size * .03}px ${size * .07}px ${size * .035}px ${size * .06}px;transform:skewX(-11deg) rotate(-4deg)}
.ic-q{position:relative;font:880 ${size * .62}px/1 var(--f-display);font-stretch:116%;color:var(--ink);margin-top:-${size * .12}px;letter-spacing:-.02em}`);

const lines = [['4', 'COUVERT', '7,00', ['#FF8AC2', '#FFE45C', '#7FD3FF', '#A6F06A']], ['1', 'POLVO À LAGAREIRO', '23,90', ['#FFE45C']], ['1', 'BACALHAU À BRÁS', '15,50', ['#FF8AC2']],
  ['1', 'ARROZ DE MARISCO 2P', '36,00', ['#7FD3FF', '#A6F06A']], ['2', 'VINHO VERDE GARRAFA', '32,00', ['#FF8AC2', '#FFE45C', '#7FD3FF', '#A6F06A']], ['3', 'IMPERIAL', '8,40', ['#FFE45C', '#7FD3FF', '#A6F06A']],
  ['4', 'PASTEL DE NATA', '6,40', ['#FF8AC2', '#FFE45C', '#7FD3FF', '#A6F06A']], ['4', 'BICA', '4,40', ['#FFE45C', '#A6F06A']]];
const marks = cs => cs.map((c, i) => `<i class="mk" style="--c:${c};left:${(i * 100 / cs.length).toFixed(1)}%;width:${(100 / cs.length).toFixed(1)}%"></i>`).join('');
const receipt = `<div class="rcpt print"><div class="rcpt-paper"><div class="rc-venue">O CANTINHO DO BEATO</div><div class="rc-c">FRI 24 OCT · 22:47 · MESA BEATK7Q</div><div class="rc-rule"></div>
<div class="rc-lines">${lines.map(([q, n, p, c]) => `<div class="rc-line"><span class="rc-marks">${marks(c)}</span><span class="rc-row"><span class="rc-q">${q}</span><span class="rc-n">${n}</span><span class="rc-p">${p}</span></span></div>`).join('')}</div>
<div class="rc-rule"></div><div class="rc-row rc-total"><span>TOTAL</span><span class="grow"></span><span class="rc-p">€ 133,60</span></div></div></div>`;
const stamp = `<svg class="stamp" viewBox="0 0 280 124"><g filter="url(#q-ink)" style="color:var(--stamp)"><rect x="5" y="5" width="270" height="114" rx="16" fill="none" stroke="currentColor" stroke-width="6"/><rect x="15" y="15" width="250" height="94" rx="9" fill="none" stroke="currentColor" stroke-width="2"/><text x="140" y="78" text-anchor="middle" fill="currentColor" style="font-family:var(--f-display);font-weight:900;font-size:68px;font-stretch:62%;letter-spacing:5px">QUITS</text><text x="140" y="100" text-anchor="middle" fill="currentColor" style="font-family:var(--f-mono);font-weight:600;font-size:10.5px;letter-spacing:1.6px">O CANTINHO DO BEATO · 24.10.2026</text></g></svg>`;
const og = page(`<div class="og"><div class="og-l"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span>
<h1>Split the bill<br>at the table.</h1><p>Friends join with a QR, tap what they had and pay you back from their own Stellar wallet.</p>
<div class="og-dots"><i style="--c:#FFE45C"></i><i style="--c:#FF8AC2"></i><i style="--c:#7FD3FF"></i><i style="--c:#A6F06A"></i><span>4 friends · everyone quits</span></div></div>
<div class="og-r">${receipt}<div class="og-stamp">${stamp}</div></div></div>`, `
.og{width:1200px;height:630px;background:radial-gradient(90% 120% at 80% 30%,#1b2448 0%,#0A0F20 60%);display:flex;align-items:center;gap:40px;padding:0 70px;box-sizing:border-box;overflow:hidden;color:var(--text)}
.og-l{flex:1}.og .wordmark .wm-t{font-size:52px}.og .wordmark{padding:2px 16px 6px}
.og h1{margin:34px 0 18px;font:850 74px/.95 var(--f-display);font-stretch:94%;letter-spacing:-.02em}
.og p{margin:0;max-width:30ch;font:500 24px/1.35 var(--f-ui);color:var(--muted)}
.og-dots{display:flex;align-items:center;margin-top:34px;font:600 18px/1 var(--f-ui);color:var(--muted)}
.og-dots i{width:34px;height:34px;border-radius:50%;background:var(--c);box-shadow:0 0 0 3px #0A0F20;margin-right:-8px}.og-dots span{margin-left:22px}
.og-r{position:relative;width:420px;transform:rotate(3deg) translateY(10px)}
.og-r .rcpt{font-size:15px}.og-r .rc-venue{font-size:30px}.og-r .rc-total{font-size:26px}.og-r .rcpt-paper{padding:28px 26px 30px}
.og-stamp{position:absolute;width:290px;left:70px;bottom:40px;transform:rotate(-12deg);opacity:.92}`);

const b = await chromium.launch();
async function shot(html, w, h, file, type = 'png') {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, file), type, ...(type === 'jpeg' ? { quality: 88 } : {}), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
for (const s of [512, 192, 180, 32]) await shot(icon(s), s, s, s === 32 ? 'favicon-32.png' : `icon-${s}.png`);
await shot(og, 1200, 630, 'og.png');
await b.close();
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: 'Quits', short_name: 'Quits', description: 'Split the bill at the table.', start_url: '/', display: 'standalone',
  background_color: '#0A0F20', theme_color: '#0A0F20',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
console.log(fs.readdirSync(OUT).join(' '));
