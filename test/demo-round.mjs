// Records the round: two phones (Carlos, the host, and Ana) through a night that is settled with "Who pays?",
// with a third player, Tom, driven through the API. Saves screencast frames per phone and caption times.
// node test/demo-round.mjs   (wrangler dev on :8787 with AI_MOCK=1 and accounts off) → then node tools/demo-round-compose.mjs
import { chromium, devices } from 'playwright';
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo, Networks } from '@stellar/stellar-sdk';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import fs from 'fs';
import path from 'path';
import { commitmentOf, sealMessage, hex, unhex, randomBytes } from '../src/shared/game.js';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const BASE = process.env.BASE || 'http://localhost:8787';
const OUT = process.env.OUT || path.join(process.env.TMPDIR || '/tmp', 'quits-demo-round');
const INVITE = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const fx = f => new URL('./fixtures/' + f, import.meta.url).pathname;
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
fs.rmSync(OUT, { recursive: true, force: true });
for (const d of ['host', 'guest', 'shots']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const api = async (p, b, h = {}) => { const r = await fetch(BASE + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-quits-invite': INVITE, ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json(); if (!r.ok) throw new Error(p + ' ' + JSON.stringify(j)); return j; };

const browser = await chromium.launch();
// The app runs on mainnet; this recording runs on testnet so no real money moves. Show it as the live app would look.
const LOOK = `.netpill{display:none!important}`;
const RENAME = () => {
  const fix = n => { if (n.nodeType === 3 && n.nodeValue.includes('localhost:8787')) n.nodeValue = n.nodeValue.replaceAll('localhost:8787', 'quits.aircade.xyz'); };
  const walk = r => { const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fix(n); };
  new MutationObserver(ms => ms.forEach(m => { m.addedNodes.forEach(n => (n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n))); if (m.type === 'characterData') fix(m.target); })).observe(document, { subtree: true, childList: true, characterData: true });
};
async function phone(name, seed) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2, locale: 'en-GB' });
  if (seed) await ctx.addInitScript(s => { for (const [k, v] of Object.entries(s)) localStorage.setItem('quits:' + k, JSON.stringify(v)); }, seed);
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

const host = await phone('host', { welcomed: 1, invite: INVITE, me: { name: 'Carlos', color: '#FFE45C', contact: '', address: keys.host.pub, accept: ['USDC'] } });
const guest = await phone('guest');
const T0 = Date.now() / 1000;
const marks = [];
const mark = label => { marks.push({ label, t: Date.now() / 1000 - T0 }); console.log(`[${(Date.now() / 1000 - T0).toFixed(1)}] ${label}`); };
const shot = async (page, file) => { await page.screenshot({ path: path.join(OUT, 'shots', file) }); };
const stopHost = await record(host, 'host');
const stopGuest = await record(guest, 'guest');
const tap = async (pg, sel) => { await pg.locator(sel).first().scrollIntoViewIfNeeded(); await wait(250); await pg.locator(sel).first().click(); };
const typeIn = async (pg, sel, text) => { await pg.click(sel); await pg.fill(sel, ''); await pg.type(sel, text, { delay: 70 }); };

// Tom: a third player who lives in this script.
const tom = { name: 'Tom', priv: ed.utils.randomPrivateKey() };
tom.pk = hex(ed.getPublicKey(tom.priv));

try {
  // ---- intro ----
  await Promise.all([guest.goto(BASE + '/'), host.goto(BASE + '/')]);
  await guest.waitForSelector('[data-screen=welcome]'); await host.waitForSelector('[data-screen=home]');
  mark('intro');
  await wait(2600);

  // ---- 1. Carlos opens a table and snaps the receipt ----
  mark('open');
  await tap(host, '[data-act=new]');
  await host.waitForSelector('[data-screen=snap]');
  await wait(900);
  await host.setInputFiles('#pick-cover', fx('sign.jpg'));
  await host.waitForFunction(() => document.querySelector('#ev-name') && document.querySelector('#ev-name').value.length >= 10, null, { timeout: 25000 });
  await wait(1200);
  await tap(host, '[data-act=open]');
  await host.waitForSelector('[data-screen=invite]');
  const code = host.url().split('/t/')[1];
  await wait(1800);

  // ---- 2. Ana scans the QR; Tom joins too ----
  mark('join');
  await guest.goto(`${BASE}/t/${code}`);
  await guest.waitForSelector('[data-screen=join]');
  await wait(1200);
  await typeIn(guest, '#g-name', 'Ana');
  await wait(300);
  await guest.locator('.sw label').nth(0).click();
  await wait(500);
  await tap(guest, '[data-act=join]');
  await guest.waitForSelector('[data-screen=wait]');
  const tj = await api(`/api/t/${code}/join`, { name: 'Tom', color: '#7FD3FF' });
  tom.creds = { 'x-quits-pid': tj.pid, 'x-quits-token': tj.token }; tom.pid = tj.pid;
  await host.waitForFunction(() => document.querySelector('.jc') && document.querySelector('.jc').textContent === '3');
  await wait(1600);

  // ---- 3. the receipt ----
  mark('receipt');
  await tap(host, '[data-act=scan]');
  await host.waitForSelector('[data-screen=receipt] #pick-rc', { state: 'attached' });
  await wait(700);
  await host.setInputFiles('#pick-rc', fx('receipt.jpg'));
  await host.waitForSelector('.rcpt.review', { timeout: 30000 });
  await wait(3600);
  await tap(host, '[data-act=send]');

  // ---- 4. everyone taps what they had ----
  await guest.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  await host.waitForSelector('[data-screen=live]');
  mark('claim');
  await wait(1000);
  const line = async (pg, text) => { const l = pg.locator('.rcpt.claim .rc-line', { hasText: text }).first(); await l.scrollIntoViewIfNeeded(); await wait(300); await l.click(); await wait(550); };
  const st0 = (await api(`/api/t/${code}/state`)).s, lids = st0.receipt.lines.map(l => l.id);
  await line(guest, 'BACALHAU');
  await api(`/api/t/${code}/act`, { type: 'claim', lid: lids[2], delta: 1 }, tom.creds);
  await line(guest, 'VINHO VERDE');
  await api(`/api/t/${code}/act`, { type: 'claim', lid: lids[1], delta: 1 }, tom.creds);
  await line(guest, 'COUVERT');
  await line(guest, 'BICA');
  await wait(600);
  await tap(host, '[data-act=tab][data-tab=mine]');
  await wait(600);
  await line(host, 'POLVO'); await line(host, 'IMPERIAL');
  await wait(600);
  // everyone is done: the receipt waits for the host, who picks a round or closes it
  await tap(guest, '[data-act=done]');
  await api(`/api/t/${code}/act`, { type: 'ready' }, tom.creds);
  await wait(700);
  await tap(host, '[data-act=done]');
  await host.waitForSelector('.sheet-foot .foot-close:not([hidden])', { timeout: 10000 });
  await wait(1600);

  // ---- 5. who pays? ----
  mark('round');
  await tap(host, '.sheet-foot .btn.primary[data-act=round]');
  await host.waitForSelector('.sheet.game [data-g=start]');
  await guest.waitForSelector('.sheet.game [data-g=in]', { timeout: 10000 });
  await wait(2600);
  await shot(guest, 'r1-propose.png');
  await tap(guest, '.sheet.game [data-g=in]');
  await wait(900);
  await tap(host, '.sheet.game [data-g=in]');
  await api(`/api/t/${code}/act`, { type: 'gameAnswer', yes: true, pk: tom.pk }, tom.creds);
  await host.waitForFunction(() => document.querySelectorAll('.gans.yes').length === 3);
  await wait(1400);
  await tap(host, '.sheet.game [data-g=start]');
  await guest.waitForSelector('.sheet.game [data-g=seal]', { timeout: 30000 });
  const g = (await api(`/api/t/${code}/state`)).s.game;

  // ---- 6. Ana seals her move (3 coins, calls 1); Carlos 2 coins calls 4; Tom 1 coin calls 3 → total 6, Ana furthest ----
  mark('seal');
  await wait(1400);
  for (let i = 0; i < 3; i++) { await tap(guest, '.sheet.game [data-g=coins][data-d="1"]'); await wait(260); }
  await wait(500);
  for (let i = 0; i < 2; i++) { await tap(guest, '.sheet.game [data-g=guess][data-d="-1"]'); await wait(260); }
  await wait(1200);
  await shot(guest, 'r2-move.png');
  await tap(guest, '.sheet.game [data-g=seal]');
  await guest.waitForFunction(() => /Sealed/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 15000 });
  // Carlos
  for (let i = 0; i < 2; i++) { await tap(host, '.sheet.game [data-g=coins][data-d="1"]'); await wait(200); }
  await tap(host, '.sheet.game [data-g=guess][data-d="1"]');
  await wait(600);
  await tap(host, '.sheet.game [data-g=seal]');
  // Tom, from the script
  const tomMove = { coins: 1, guess: 3, salt: randomBytes(32) };
  const tc = await commitmentOf(unhex(g.id), unhex(tom.pk), tomMove.coins, tomMove.guess, tomMove.salt);
  await api(`/api/t/${code}/act`, { type: 'gameSeal', commitment: hex(tc), sig: hex(ed.sign(sealMessage(unhex(g.id), tc), tom.priv)) }, tom.creds);
  await host.waitForFunction(() => /Sealed/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 15000 });
  await wait(2000);
  await shot(host, 'r3-sealed.png');

  // ---- 7. the moves open ----
  await guest.waitForFunction(() => /Opening|pays/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 60000 });
  mark('opening');
  // Tom opens as soon as the phones do
  for (let i = 0; i < 20; i++) { try { await api(`/api/t/${code}/act`, { type: 'gameOpen', coins: tomMove.coins, guess: tomMove.guess, salt: hex(tomMove.salt) }, tom.creds); break; } catch (e) { await wait(800); } }
  await wait(2500);
  await shot(guest, 'r4-opening.png');

  // ---- 8. the verdict ----
  await guest.waitForFunction(() => /pays|You pay/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 90000 });
  mark('verdict');
  await wait(3800);
  await shot(guest, 'r5-verdict.png');
  await shot(host, 'r5-verdict-host.png');
  await tap(host, '.sheet.game [data-g=ok]');
  await tap(guest, '.sheet.game [data-g=ok]');
  await wait(900);
  // everyone was done, so the finished round closed the receipt by itself
  await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Paying back', null, { timeout: 10000 });
  await wait(1800);
  await shot(host, 'r6-live.png');

  // ---- 9. Ana pays Carlos back for everyone ----
  mark('pay');
  await guest.waitForSelector('[data-act=pay]:not([disabled])');
  await wait(900);
  await tap(guest, '[data-act=pay]');
  await guest.waitForSelector('[data-screen=pay]');
  await wait(2600);
  await shot(guest, 'r7-pay.png');
  // let the ways to pay and the perk sink in
  await guest.evaluate(() => { const n = document.querySelector('.perknote'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); });
  await wait(2600);
  await tap(guest, '[data-act=manual]');
  await guest.waitForSelector('.manual .cprow');
  await wait(700);
  await guest.locator('.manual').scrollIntoViewIfNeeded();
  await wait(1000);
  const rows = await guest.$$eval('.manual .cprow b', bs => bs.map(b => b.textContent));
  const amount = rows[1].split(' ')[0], memo = rows[2];
  const kp = Keypair.fromSecret(keys.guest.sec), acct = await hz.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: keys.host.pub, asset: USDC, amount })).addMemo(Memo.text(memo)).setTimeout(60).build();
  tx.sign(kp);
  const sent = await hz.submitTransaction(tx);
  console.log('paid on testnet', sent.hash);
  await guest.waitForSelector('[data-screen=paid]', { timeout: 40000 });

  // ---- 10. quits ----
  mark('quits');
  await host.waitForSelector('.qm', { timeout: 20000 });
  await wait(2600);
  await shot(host, 'r8-quits.png');
  await wait(800);

  // ---- 11. the night, round included ----
  mark('night');
  await tap(host, '[data-qm=night]');
  await host.waitForSelector('[data-screen=memory]');
  await tap(guest, '[data-act=night]');
  await guest.waitForSelector('[data-screen=memory]');
  await wait(1400);
  await host.evaluate(() => { const c = document.querySelector('.gcard'); if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  await wait(2800);
  await shot(host, 'r9-night.png');
  mark('end');
  await wait(600);
} catch (e) {
  console.log('FAILED', e.message.split('\n')[0]);
  try { await shot(host, 'fail-host.png'); await shot(guest, 'fail-guest.png'); } catch (err) { /* gone */ }
  process.exitCode = 1;
} finally {
  const hi = await stopHost(), gi = await stopGuest();
  fs.writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify({ T0, end: Date.now() / 1000 - T0, marks, host: hi.map(([t, f]) => [t - T0, f]), guest: gi.map(([t, f]) => [t - T0, f]) }));
  console.log('frames', hi.length, gi.length, 'errors', host.errors.concat(guest.errors).slice(0, 4));
  await browser.close();
}
