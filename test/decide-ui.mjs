// Everyone taps "I'm done": the receipt no longer closes itself. The host is offered the round or closing it.
import { chromium } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8787';
const INVITE = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const browser = await chromium.launch();
const phone = async name => { const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await c.newPage(); p.on('pageerror', e => log(name, 'page error', e.message)); return p; };
const host = await phone('host'), ana = await phone('ana');
const img = 'data:image/png;base64,' + fs.readFileSync(new URL('./tiny.png', import.meta.url)).toString('base64');
// the table, through the API (the screens of opening a table are covered elsewhere)
const call = async (path, body, creds) => { const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-quits-invite': INVITE, ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token } : {}) }, body: JSON.stringify(body) }); const j = await r.json(); if (!r.ok) throw new Error(path + ' ' + JSON.stringify(j)); return j; };
const t = await call('/api/tables', { name: 'Decide', hostName: 'Carlos', color: '#FFE45C', address: 'GBVSOHYYIFHDNYEODKCQOGOYHO6BDXGXQJGJHEA2KTCMCOKWGN7EKFUF', cover: img });
const hc = { pid: t.pid, token: t.token };
const ac = await call(`/api/t/${t.code}/join`, { name: 'Ana', color: '#FF8AC2' });
const rc = await call(`/api/t/${t.code}/receipt`, { image: img }, hc);
let r = await call(`/api/t/${t.code}/act`, { type: 'publish', lines: rc.lines, tip: 0, imageId: rc.imageId, printedTotal: rc.total }, hc);
const ids = r.s.receipt.lines.map(l => l.id);
await call(`/api/t/${t.code}/act`, { type: 'claim', lid: ids[0], delta: 1 }, hc);
await call(`/api/t/${t.code}/act`, { type: 'claim', lid: ids[1], delta: 1 }, ac);
log('table', t.code);
// the phones
for (const [p, c] of [[host, hc], [ana, ac]]) {
  await p.goto(BASE + '/');
  await p.evaluate(([code, creds]) => localStorage.setItem('quits:t:' + code, JSON.stringify(creds)), [t.code, c]);
  await p.goto(`${BASE}/t/${t.code}`);
}
await host.waitForSelector('[data-screen=live]'); await ana.waitForSelector('[data-screen=claim]');
await ana.click('[data-act=done]');
await host.click('[data-act=done]');
await host.waitForSelector('.sheet-foot .foot-close:not([hidden])', { timeout: 10000 });
const btn = await host.textContent('.sheet-foot .btn.primary');
let s = (await (await fetch(`${BASE}/api/t/${t.code}/state`)).json()).s;
log('everyone done: phase', s.phase, '| host button:', btn.trim(), '| ana:', (await ana.textContent('.sheet-foot .btn.primary')).trim());
if (s.phase !== 'claiming' || !/Play a round/.test(btn)) { log('FAIL: the receipt should wait for the host'); process.exit(1); }
await host.screenshot({ path: 'docs/screens/r0-decide.png' });
// the host picks the round, then calls it off: back to deciding
await host.click('.sheet-foot .btn.primary');
await ana.waitForSelector('.sheet.game [data-g=in]', { timeout: 15000 });
await host.waitForSelector('.sheet.game [data-g=off]', { timeout: 15000 });
await host.click('.sheet.game [data-g=off]');
await host.waitForSelector('.sheet-foot .foot-close:not([hidden])', { timeout: 10000 });
s = (await (await fetch(`${BASE}/api/t/${t.code}/state`)).json()).s;
log('round called off: phase', s.phase, 'game', s.game && s.game.status);
// and closes the receipt
await host.click('.sheet-foot .foot-close');
await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Paying back', null, { timeout: 10000 });
s = (await (await fetch(`${BASE}/api/t/${t.code}/state`)).json()).s;
log('closed: phase', s.phase);
console.log(s.phase === 'settling' ? 'OK' : 'FAIL');
await browser.close();
