// Renders an illustration of a dinner table seen from above, used as "a photo of the night" in the demo.
import { chromium } from 'playwright';
const plate = (x, y, food) => `<div style="position:absolute;left:${x}px;top:${y}px;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#fff,#e9e6df 70%);box-shadow:0 18px 30px rgba(0,0,0,.45),inset 0 0 0 18px #f6f4ee">${food}</div>`;
const blob = (x, y, w, h, c, r = 50) => `<i style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:${r}%;background:${c};box-shadow:inset -8px -10px 0 rgba(0,0,0,.12)"></i>`;
const glass = (x, y, c) => `<div style="position:absolute;left:${x}px;top:${y}px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.75),${c} 55%,rgba(0,0,0,.25));box-shadow:0 14px 24px rgba(0,0,0,.4)"></div>`;
const html = `<!doctype html><html><body style="margin:0;width:1200px;height:1200px;overflow:hidden;background:
 radial-gradient(80% 70% at 50% 45%, rgba(255,200,140,.35), rgba(0,0,0,.55)),
 repeating-linear-gradient(90deg,#6b4328 0 22px,#7a4d2e 22px 38px,#5e3a22 38px 56px,#714829 56px 84px);position:relative">
${plate(140, 150, blob(70, 80, 160, 120, '#e8b04a') + blob(110, 120, 70, 50, '#c0392b'))}
${plate(720, 120, blob(60, 70, 180, 150, '#d6a26a', 40) + blob(120, 150, 60, 40, '#6aa84f'))}
${plate(160, 720, blob(80, 90, 140, 130, '#f2d16b') + blob(130, 110, 40, 40, '#e67e22'))}
${plate(740, 700, blob(60, 90, 180, 110, '#a0522d', 30) + blob(90, 120, 120, 40, '#f4e1c1', 30))}
${glass(520, 260, 'rgba(240,220,120,.85)')}${glass(560, 820, 'rgba(250,240,200,.7)')}${glass(1010, 470, 'rgba(120,40,50,.85)')}${glass(60, 520, 'rgba(240,220,120,.85)')}
<div style="position:absolute;left:470px;top:470px;width:260px;height:260px;border-radius:50%;background:radial-gradient(circle,#f3efe6,#d9d3c6);box-shadow:0 18px 30px rgba(0,0,0,.45)">${blob(40, 50, 180, 160, '#e9a23b') + blob(70, 80, 50, 40, '#c0392b') + blob(140, 120, 50, 40, '#c0392b') + blob(100, 60, 40, 30, '#2e7d32')}</div>
</body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1200 } });
await p.setContent(html); await p.screenshot({ path: new URL('./fixtures/table.jpg', import.meta.url).pathname, type: 'jpeg', quality: 88 }); await b.close();
