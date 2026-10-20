// Mobile pay screen with WalletConnect: does the wallet picker open? (can't approve in a test browser)
import { chromium, devices } from 'playwright';
import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8787';
const SHOTS = '/tmp/claude-0/-home-claude/7ad6a8ac-ff95-5c75-b7c9-3bc1a727a40f/scratchpad/shots';
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const INVITE = process.env.INVITE || (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
async function call(path, body, creds) { const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-quits-invite': INVITE, ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token } : {}) }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(path + JSON.stringify(j)); return j; }
const t = await call('/api/tables', { name: 'WC test', hostName: 'Carlos', address: keys.host.pub });
const host = { pid: t.pid, token: t.token };
const b = await chromium.launch(); const ctx = await b.newContext({ ...devices['Pixel 7'] }); const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
const reqs = new Set(); pg.on('request', r => { const u = new URL(r.url()); if (!u.host.startsWith('localhost')) reqs.add(u.host); });
await pg.goto(`${BASE}/t/${t.code}`);
await pg.fill('#g-name', 'Ana'); await pg.click('[data-act=join]'); await pg.waitForSelector('[data-screen=wait]');
await call(`/api/t/${t.code}/act`, { type: 'publish', lines: [{ qty: 1, name: 'POLVO', total: 2390, kind: 'dish' }], tip: 0 }, host);
await pg.waitForSelector('[data-screen=claim] .rcpt.claim');
await pg.locator('.rcpt.claim .rc-line').first().click(); await pg.waitForTimeout(400);
await pg.click('[data-act=done]');
await call(`/api/t/${t.code}/act`, { type: 'ready' }, host);
await pg.click('[data-act=pay]:not([disabled])');
await pg.waitForSelector('[data-screen=pay]');
const opts = await pg.$$eval('.payopt b', bs => bs.map(b => b.textContent));
console.log('pay options:', opts);
await pg.click('[data-act=wallet][data-kind=app]');
const t1 = Date.now();
const res = await Promise.race([
  pg.waitForSelector('w3m-modal, appkit-modal', { state: 'attached', timeout: 25000 }).then(() => 'modal'),
  pg.waitForSelector('.toast', { timeout: 25000 }).then(async () => 'toast: ' + (await pg.textContent('.toast'))),
]).catch(e => 'nothing: ' + e.message.split('\n')[0]);
console.log('after tapping wallet app:', res, `${Date.now() - t1} ms`);
await pg.waitForTimeout(4000);
await pg.screenshot({ path: SHOTS + '/wc-smoke.png' });
console.log('external hosts:', [...reqs].join(', '));
console.log('errors:', errs.slice(0, 5));
await b.close();
