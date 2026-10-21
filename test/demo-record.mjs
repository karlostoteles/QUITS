// Records the demo: two phones (Carlos, the host, and Ana, a guest) through a whole night, with a real testnet payment.
// Saves screencast frames per phone, caption times and README screenshots. Then run tools/demo-compose.py.
import { chromium, devices } from 'playwright';
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || '/tmp/claude-0/-home-claude/7ad6a8ac-ff95-5c75-b7c9-3bc1a727a40f/scratchpad/demo';
const INVITE = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const fx = f => new URL('./fixtures/' + f, import.meta.url).pathname;
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['host', 'guest', 'shots']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));

// the host's account: signed in, invited, with his Stellar address saved
const api = async (p, b, h = {}) => { const r = await fetch(BASE + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + JSON.stringify(j)); return j; };
const login = await api('/api/auth/google', { credential: `test:carlosdemo${Date.now().toString(36)}:Carlos` });
const AUTH = { authorization: 'Bearer ' + login.session };
await api('/api/me/invite', { code: INVITE }, AUTH);
await api('/api/me', { name: 'Carlos', address: keys.host.pub, color: '#FFE45C' }, AUTH);

const browser = await chromium.launch();
// The app runs on mainnet; this recording runs on testnet so no real money moves. Show it as the live app would look.
const LOOK = `.netpill{display:none!important}`;
const RENAME = () => {
  const fix = n => { if (n.nodeType === 3 && n.nodeValue.includes('localhost:8787')) n.nodeValue = n.nodeValue.replaceAll('localhost:8787', 'quits.aircade.xyz'); };
  const walk = r => { const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fix(n); };
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(n => (n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n))); if (m.type === 'characterData') fix(m.target); })).observe(document, { subtree: true, childList: true, characterData: true });
};
async function phone(name, session) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'en-GB' });
  if (session) await ctx.addInitScript(s => localStorage.setItem('quits:session', JSON.stringify(s)), session);
  await ctx.addInitScript(RENAME);
  const page = await ctx.newPage();
  page.on('load', () => page.addStyleTag({ content: LOOK }).catch(() => {}));
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  return page;
}
async function record(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const dir = path.join(OUT, name), index = [];
  let i = 0;
  cdp.on('Page.screencastFrame', async f => {
    const file = `${String(++i).padStart(6, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64'));
    index.push([f.metadata.timestamp, file]);
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) { /* closed */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 780, maxHeight: 1688 });
  return async () => { try { await cdp.send('Page.stopScreencast'); } catch (e) { /* closed */ } return index; };
}

const host = await phone('host', login.session);
const guest = await phone('guest');
const T0 = Date.now() / 1000;
const marks = [];
const mark = label => { marks.push({ label, t: Date.now() / 1000 - T0 }); console.log(`[${(Date.now() / 1000 - T0).toFixed(1)}] ${label}`); };
const shot = async (page, file) => { await page.screenshot({ path: path.join(OUT, 'shots', file) }); };
const stopHost = await record(host, 'host');
const stopGuest = await record(guest, 'guest');
const tap = async (pg, sel) => { await pg.locator(sel).first().scrollIntoViewIfNeeded(); await wait(250); await pg.locator(sel).first().click(); };
const typeIn = async (pg, sel, text) => { await pg.click(sel); await pg.fill(sel, ''); await pg.type(sel, text, { delay: 70 }); };

try {
  // ---- intro: Ana has never seen Quits; Carlos is signed in ----
  await Promise.all([guest.goto(BASE + '/'), host.goto(BASE + '/')]);
  await guest.waitForSelector('[data-screen=welcome]'); await host.waitForSelector('[data-screen=home]');
  mark('intro');
  await wait(3200);
  await shot(guest, '01-welcome.png');

  // ---- 1. Carlos opens a table ----
  mark('open');
  await tap(host, '[data-act=new]');
  await host.waitForSelector('[data-screen=snap]');
  await wait(1200);
  await host.setInputFiles('#pick-cover', fx('sign.jpg'));
  await host.waitForFunction(() => document.querySelector('#ev-name') && document.querySelector('#ev-name').value.length >= 19, null, { timeout: 25000 });
  await wait(1600);
  await shot(host, '02-open.png');
  await tap(host, '[data-act=open]');
  await host.waitForSelector('[data-screen=invite]');
  const code = host.url().split('/t/')[1];
  await wait(2600);

  // ---- 2. Ana scans the QR ----
  mark('join');
  await guest.goto(`${BASE}/t/${code}`);
  await guest.waitForSelector('[data-screen=join]');
  await wait(1500);
  await typeIn(guest, '#g-name', 'Ana');
  await wait(400);
  await guest.locator('.sw label').nth(0).click();
  await wait(700);
  await shot(guest, '04-join.png');
  await tap(guest, '[data-act=join]');
  await guest.waitForSelector('[data-screen=wait]');
  await host.waitForFunction(() => document.querySelector('.jc') && document.querySelector('.jc').textContent === '2');
  await wait(2200);
  await shot(host, '03-table.png');

  // ---- 3. the receipt ----
  mark('receipt');
  await tap(host, '[data-act=scan]');
  await host.waitForSelector('[data-screen=receipt] #pick-rc', { state: 'attached' });
  await wait(900);
  await host.setInputFiles('#pick-rc', fx('receipt.jpg'));
  await host.waitForSelector('.rcpt.review', { timeout: 30000 });
  await wait(3400);
  await shot(host, '05-receipt.png');
  await tap(host, '[data-act=tip][data-tip="5"]');
  await wait(600);
  await tap(host, '[data-act=send]');

  // ---- 4. everyone taps what they had ----
  await guest.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  await host.waitForSelector('[data-screen=live]');
  mark('claim');
  await wait(1400);
  const line = async (pg, text) => { const l = pg.locator('.rcpt.claim .rc-line', { hasText: text }).first(); await l.scrollIntoViewIfNeeded(); await wait(350); await l.click(); await wait(650); };
  await line(guest, 'BACALHAU');
  await line(host, 'POLVO');
  await line(guest, 'VINHO VERDE');
  await line(host, 'VINHO VERDE');
  await line(guest, 'COUVERT');
  await line(host, 'COUVERT');
  await line(guest, 'PASTEL');
  await line(host, 'IMPERIAL');
  await line(guest, 'BICA');
  await wait(900);
  await shot(guest, '06-claim.png');
  await tap(guest, '[data-act=done]');
  await wait(900);
  await tap(host, '[data-act=done]');
  await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Paying back', null, { timeout: 10000 });
  await wait(1800);
  await shot(host, '07-live.png');

  // ---- 5. Ana pays Carlos back ----
  mark('pay');
  await guest.waitForSelector('[data-act=pay]:not([disabled])');
  await wait(1200);
  await tap(guest, '[data-act=pay]');
  await guest.waitForSelector('[data-screen=pay]');
  await wait(1800);
  await tap(guest, '[data-act=manual]');
  await guest.waitForSelector('.manual .cprow');
  await wait(900);
  await guest.locator('.manual').scrollIntoViewIfNeeded();
  await wait(1200);
  await shot(guest, '08-pay.png');
  const rows = await guest.$$eval('.manual .cprow b', bs => bs.map(b => b.textContent));
  const amount = rows[1].split(' ')[0], memo = rows[2];
  const kp = Keypair.fromSecret(keys.guest.sec), acct = await hz.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: keys.host.pub, asset: USDC, amount })).addMemo(Memo.text(memo)).setTimeout(60).build();
  tx.sign(kp);
  const sent = await hz.submitTransaction(tx);
  console.log('paid on testnet', sent.hash);
  await guest.waitForSelector('[data-screen=paid]', { timeout: 40000 });

  // ---- 6. quits ----
  mark('quits');
  await host.waitForSelector('.qm', { timeout: 20000 });
  await wait(2600);
  await shot(host, '10-quits.png');
  await shot(guest, '09-paid.png');
  await wait(1200);

  // ---- 7. the night ----
  mark('night');
  await tap(host, '[data-qm=night]');
  await host.waitForSelector('[data-screen=memory]');
  await tap(guest, '[data-act=night]');
  await guest.waitForSelector('[data-screen=memory]');
  await wait(1800);
  await guest.setInputFiles('#mem-photo', fx('table.jpg'));
  await host.waitForSelector('.pgrid .ph', { timeout: 15000 });
  await wait(1200);
  await host.evaluate(() => document.querySelector('.mem-scroll').scrollTo({ top: 360, behavior: 'smooth' }));
  await wait(2600);
  await shot(host, '11-night.png');
  await host.goto(BASE + '/');
  await host.waitForSelector('.stub');
  await wait(2400);
  await shot(host, '12-home.png');
  mark('end');
  await wait(800);
} catch (e) {
  console.log('FAILED', e.message.split('\n')[0]);
  process.exitCode = 1;
} finally {
  const hi = await stopHost(), gi = await stopGuest();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ T0, end: Date.now() / 1000 - T0, marks, host: hi.map(([t, f]) => [t - T0, f]), guest: gi.map(([t, f]) => [t - T0, f]) }));
  console.log('frames', hi.length, gi.length, 'errors', host.errors.concat(guest.errors).slice(0, 4));
  await browser.close();
}
