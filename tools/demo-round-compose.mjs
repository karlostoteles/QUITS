// Turns the recorded round (test/demo-round.mjs) into a 1080p video with two phones and captions, plus a GIF teaser.
// node tools/demo-round-compose.mjs   → OUT/demo-round.mp4, OUT/demo-round-teaser.gif, OUT/poster-round.jpg
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OUT || path.join(process.env.TMPDIR || '/tmp', 'quits-demo-round');
const TL = JSON.parse(fs.readFileSync(path.join(OUT, 'timeline.json'), 'utf8'));
const W = 1920, H = 1080, FPS = 30;
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });

// ---- 1. each phone's frames → a constant-rate video on the shared timeline ----
for (const who of ['host', 'guest']) {
  if (fs.existsSync(path.join(OUT, `${who}.mp4`)) && !process.env.REDO) continue;
  const fr = TL[who], dir = path.join(OUT, who);
  let list = 'ffconcat version 1.0\n';
  const first = Math.max(0, fr[0][0]);
  if (first > 0) list += `file '${path.join(dir, fr[0][1])}'\nduration ${first.toFixed(4)}\n`;
  fr.forEach(([t, f], i) => { const next = i + 1 < fr.length ? fr[i + 1][0] : TL.end; list += `file '${path.join(dir, f)}'\nduration ${Math.max(0.001, next - Math.max(t, 0)).toFixed(4)}\n`; });
  list += `file '${path.join(dir, fr[fr.length - 1][1])}'\n`;
  fs.writeFileSync(path.join(OUT, `${who}.ffconcat`), list);
  ff(['-f', 'concat', '-safe', '0', '-i', path.join(OUT, `${who}.ffconcat`), '-vf', `fps=${FPS},scale=780:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '16', '-preset', 'medium', path.join(OUT, `${who}.mp4`)]);
}
const [vw, vh] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path.join(OUT, 'host.mp4')]).toString().trim().split(',').map(Number);

// ---- 2. stills: background, bezels, captions, title and end cards (rendered with the app's own CSS) ----
const css = fs.readFileSync(path.join(ROOT, 'public/assets', fs.readdirSync(path.join(ROOT, 'public/assets')).find(f => f.endsWith('.css'))), 'utf8').replaceAll('url(/fonts/', `url(file://${ROOT}/public/fonts/`);
const SH = 840, SW = Math.round(SH * vw / vh), BZ = 16, GAP = 56;                 // screen size inside each phone
const PX = [W - 90 - 2 * (SW + 2 * BZ) - GAP, W - 90 - (SW + 2 * BZ)], PY = 112;   // phones on the right
const page = (body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${css}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:transparent}${extra}</style></head><body>${body}</body></html>`;
const people = [['C', '#FFE45C', 'Carlos', 'paid the bill'], ['A', '#FF8AC2', 'Ana', 'at the table']];
const labels = people.map(([i, c, n, r], k) => `<div class="dv-lab" style="left:${PX[k]}px;width:${SW + 2 * BZ}px"><span class="av" style="--c:${c};--z:30px">${i}</span><b>${n}</b><span>${r}</span></div>`).join('');
const bg = page(`<div class="dv-bg"><div class="dv-glow"></div>
  <div class="dv-brand"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span></div>
  ${labels}
  <div class="dv-foot"><b>quits.aircade.xyz</b><span>Recorded on Stellar testnet. Tom plays from a third phone, not shown.</span></div></div>`, `
  .dv-bg{position:absolute;inset:0;background:radial-gradient(70% 90% at 72% 50%,#16204a 0%,#0A0F20 62%,#05080F 100%)}
  .dv-glow{position:absolute;left:-10%;top:-20%;width:60%;height:80%;background:radial-gradient(closest-side,rgba(255,228,92,.08),transparent)}
  .dv-brand{position:absolute;left:110px;top:96px}.dv-brand .wm-t{font-size:44px}.dv-brand .wordmark{padding:2px 14px 6px}
  .dv-lab{position:absolute;top:58px;display:flex;align-items:center;gap:10px;font:500 20px/1 var(--f-ui);color:var(--muted)}
  .dv-lab b{color:var(--text);font-weight:650}
  .dv-foot{position:absolute;left:110px;bottom:84px;display:flex;flex-direction:column;gap:8px;font:500 17px/1.3 var(--f-ui);color:var(--dim)}
  .dv-foot b{font:600 20px/1 var(--f-mono);font-stretch:87.5%;color:var(--muted)}`);
const bezel = page(PX.map(x => `<div class="dv-phone" style="left:${x}px;top:${PY}px"></div>`).join(''), `
  .dv-phone{position:absolute;width:${SW + 2 * BZ}px;height:${SH + 2 * BZ}px;box-sizing:border-box;border:${BZ}px solid #0d1120;border-radius:${46 + BZ}px;box-shadow:0 0 0 1.5px #2a3360,0 40px 90px -30px rgba(0,0,0,.9)}`);
const STEPS = {
  intro: ['', 'Carlos paid the bill.', 'Ana and Tom are at the table. Quits splits it. Or they play for it.'],
  open: ['1', 'Carlos opens a table', 'A photo of the place. Ana and Tom scan the QR: no app, no account.'],
  receipt: ['2', 'Carlos snaps the receipt', 'AI reads every line.'],
  claim: ['3', 'Everyone taps what they had', 'Live for the whole table. When everyone is done, Carlos chooses: close the receipt, or play for it.'],
  round: ['4', 'Who pays? Carlos proposes a round', 'Hidden coins. Everyone who is in hides 0–3 in a fist and calls the total.'],
  seal: ['5', 'Ana seals her move', 'A hash signed with a key only her phone has, on a Soroban contract. Nobody sees it until everyone has sealed.'],
  opening: ['6', 'The moves open', 'Each phone opens its move; the contract checks it against the seal.'],
  verdict: ['7', 'The contract decides', 'Furthest from the total pays for everyone who played. Ties are drawn. Silence loses.'],
  pay: ['8', 'The onboarding moment', 'Ana picks how to pay Carlos back. From a wallet it lands in seconds, with no fee, and with whatever perk the ecosystem attaches: here, 5% back in USDC. Carlos and Tom are off the hook.'],
  night: ['9', 'The night stays, round included', 'Who had what, the moves, and the transaction that decided it.'],
};
const caption = ([n, t, s]) => page(`<div class="dv-cap">${n ? `<span class="dv-step">Step ${n} of 9</span>` : ''}<h1>${t}</h1><p>${s}</p></div>`, `
  .dv-cap{position:absolute;left:110px;top:300px;width:${PX[0] - 110 - 90}px;display:flex;flex-direction:column;gap:20px}
  .dv-step{font:600 15px/1 var(--f-ui);letter-spacing:.16em;text-transform:uppercase;color:var(--yellow)}
  .dv-cap h1{margin:0;font:850 66px/.98 var(--f-display);font-stretch:94%;letter-spacing:-.02em;color:var(--text);text-wrap:balance}
  .dv-cap p{margin:0;font:500 26px/1.38 var(--f-ui);color:var(--muted);text-wrap:pretty}`);
const card = (title, sub, small) => page(`<div class="dv-bg"><div class="dv-c"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span><h1>${title}</h1><p>${sub}</p>${small ? `<small>${small}</small>` : ''}</div></div>`, `
  .dv-bg{position:absolute;inset:0;background:radial-gradient(70% 90% at 50% 45%,#16204a 0%,#0A0F20 62%,#05080F 100%);display:grid;place-items:center}
  .dv-c{display:flex;flex-direction:column;align-items:center;gap:26px;text-align:center}
  .dv-c .wm-t{font-size:84px}.dv-c .wordmark{padding:4px 26px 10px}
  .dv-c h1{margin:6px 0 0;font:850 78px/1 var(--f-display);font-stretch:94%;letter-spacing:-.02em;color:var(--text)}
  .dv-c p{margin:0;font:500 30px/1.4 var(--f-ui);color:var(--muted);max-width:30ch}
  .dv-c small{font:600 22px/1 var(--f-mono);font-stretch:87.5%;color:var(--dim);margin-top:18px}`);
const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: W, height: H } });
const CAP = { x: 100, y: 280, width: PX[0] - 140, height: 560 };
const still = async (html, file, transparent, clip) => { await pg.setContent(html); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(100); await pg.screenshot({ path: path.join(OUT, file), omitBackground: !!transparent, ...(clip ? { clip } : {}) }); };
await still(bg, 'bg.png');
await still(bezel, 'bezel.png', true);
for (const k of Object.keys(STEPS)) await still(caption(STEPS[k]), `cap-${k}.png`, true, CAP);
await still(card('Split the bill at the table. Or play for it.', 'A round of hidden coins, sealed and judged by a Soroban contract, decides who pays for everyone.'), 'title.png');
await still(card('quits.aircade.xyz', 'Payments on Stellar mainnet; the round on testnet during HackMeridian. USDC by Circle, wallet to wallet.', 'github.com/karlostoteles/QUITS'), 'end.png');
await b.close();

// ---- 3. the main part: background, two phones, bezels, captions that fade in and out ----
const dur = TL.end;
const marks = TL.marks.filter(m => STEPS[m.label] || m.label === 'end');
const spans = marks.filter(m => STEPS[m.label]).map((m, i, a) => ({ k: m.label, a: i === 0 ? 0 : m.t, b: i + 1 < a.length ? a[i + 1].t : dur }));
const inputs = ['-loop', '1', '-t', String(dur), '-i', path.join(OUT, 'bg.png'), '-i', path.join(OUT, 'host.mp4'), '-i', path.join(OUT, 'guest.mp4'), '-loop', '1', '-t', String(dur), '-i', path.join(OUT, 'bezel.png')];
spans.forEach(s => inputs.push('-loop', '1', '-t', String(dur), '-i', path.join(OUT, `cap-${s.k}.png`)));
let g = `[1:v]scale=${SW}:${SH}:flags=lanczos,setsar=1[h];[2:v]scale=${SW}:${SH}:flags=lanczos,setsar=1[g];[0:v][h]overlay=${PX[0] + BZ}:${PY + BZ}[a];[a][g]overlay=${PX[1] + BZ}:${PY + BZ}[b];[b][3:v]overlay=0:0[c0]`;
spans.forEach((s, i) => {
  const fi = 0.35, a = Math.max(0, s.a), e = s.b;
  g += `;[${4 + i}:v]format=rgba,fade=t=in:st=${a.toFixed(2)}:d=${fi}:alpha=1,fade=t=out:st=${Math.max(a, e - fi).toFixed(2)}:d=${fi}:alpha=1[t${i}];[c${i}][t${i}]overlay=${CAP.x}:${CAP.y}[c${i + 1}]`;
});
g += `;[c${spans.length}]format=yuv420p[v]`;
ff([...inputs, '-filter_complex', g, '-map', '[v]', '-r', String(FPS), '-t', String(dur), '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', path.join(OUT, 'main.mp4')]);

// ---- 4. title → main → end, with short crossfades ----
const T = 3.2, E = 4, X = 0.6;
ff(['-loop', '1', '-t', String(T), '-i', path.join(OUT, 'title.png'), '-i', path.join(OUT, 'main.mp4'), '-loop', '1', '-t', String(E), '-i', path.join(OUT, 'end.png'),
  '-filter_complex', `[0:v]fps=${FPS},format=yuv420p,setsar=1[t];[1:v]fps=${FPS},format=yuv420p,setsar=1[m];[2:v]fps=${FPS},format=yuv420p,setsar=1[e];[t][m]xfade=transition=fade:duration=${X}:offset=${T - X}[tm];[tm][e]xfade=transition=fade:duration=${X}:offset=${(T + dur - 2 * X).toFixed(2)}[v]`,
  '-map', '[v]', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(OUT, 'demo-round.mp4')]);

// ---- 5. a poster frame and a short GIF teaser for the README ----
const at = l => (TL.marks.find(m => m.label === l) || { t: 0 }).t + T - X;
ff(['-ss', String((at('verdict') + 2.5).toFixed(2)), '-i', path.join(OUT, 'demo-round.mp4'), '-frames:v', '1', '-q:v', '3', path.join(OUT, 'poster-round.jpg')]);
const ts = at('round') + 1, te = at('verdict') + 4.5;
ff(['-ss', ts.toFixed(2), '-t', (te - ts).toFixed(2), '-i', path.join(OUT, 'demo-round.mp4'), '-vf', 'fps=12,scale=720:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', path.join(OUT, 'demo-round-teaser.gif')]);
for (const f of ['demo-round.mp4', 'demo-round-teaser.gif', 'poster-round.jpg']) console.log(f, (fs.statSync(path.join(OUT, f)).size / 1048576).toFixed(1) + ' MB');
console.log('duration', execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, 'demo-round.mp4')]).toString().trim(), 's');
