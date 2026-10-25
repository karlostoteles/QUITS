// The whole night in two real browsers (host and guest phones) against the local worker, with a real testnet payment.
// node test/ui-flow.mjs   (needs `wrangler dev` on :8787)
import { chromium, devices } from 'playwright';
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:8787';
const INVITE = process.env.INVITE || (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const SHOTS = process.env.SHOTS || '/tmp/claude-0/-home-claude/7ad6a8ac-ff95-5c75-b7c9-3bc1a727a40f/scratchpad/shots';
fs.mkdirSync(SHOTS, { recursive: true });
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const fx = f => new URL('./fixtures/' + f, import.meta.url).pathname;
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const USDC = new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const HEALTH = await (await fetch(BASE + '/api/health')).json();
const ACC = HEALTH.accounts && HEALTH.authTest; // accounts with the local test sign-in
log('mode:', ACC ? 'accounts (test sign-in)' : HEALTH.accounts ? 'accounts (Google)' : 'no accounts');
const RUN = Date.now().toString(36);
const testLogin = async (page, who) => { const [sub, name] = who.split(':'); await page.evaluate(w => { window.__quitsTestUser = w; }, `${sub}${RUN}:${name}`); await page.click('.gtest'); };

const browser = await chromium.launch();
async function phone(name, dev) {
  const ctx = await browser.newContext({ ...devices[dev], locale: 'en-GB' });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.shot = async label => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, `${name}-${label}.png`) }); };
  return page;
}
const host = await phone('host', 'iPhone 13');
const guest = await phone('guest', 'Pixel 7');
const tom = await phone('tom', 'iPhone 13');
let step = 'start';
try {
  // ---- host opens a table ----
  step = 'welcome';
  await host.goto(BASE + '/');
  await host.waitForSelector('[data-screen=welcome]');
  await host.waitForTimeout(2600);
  await host.shot('00-welcome');
  if (ACC) await testLogin(host, 'carlos:Carlos de la Figuera');
  else await host.click('[data-act=start]');
  if (!ACC) { await host.waitForSelector('[data-screen=home]'); await host.getByRole('button', { name: 'Open a table' }).click(); }
  step = 'invite-code';
  await host.waitForSelector('[data-screen=code]');
  await host.fill('#inv-code', 'nata-0000');
  await host.click('[data-act=go]');
  await host.waitForSelector('.code-body .form-err:not([hidden])');
  await host.shot('00-invite-wrong');
  await host.fill('#inv-code', INVITE.toLowerCase());
  await host.click('[data-act=go]');
  if (ACC) { await host.waitForSelector('[data-screen=home]'); await host.shot('00-home-empty'); await host.getByRole('button', { name: 'Open a table' }).click(); }
  await host.waitForSelector('[data-screen=snap]');
  await host.shot('01-snap');
  step = 'cover';
  await host.setInputFiles('#pick-cover', fx('sign.jpg'));
  await host.waitForFunction(() => document.querySelector('#ev-name') && document.querySelector('#ev-name').value.length > 8, null, { timeout: 20000 });
  await host.waitForTimeout(1200);
  log('sign read as:', await host.inputValue('#ev-name'));
  await host.fill('#host-name', 'Carlos');
  await host.fill('#host-addr', keys.host.pub);
  await host.shot('02-details');
  await host.click('[data-act=open]');
  await host.waitForSelector('[data-screen=invite]', { timeout: 20000 });
  const code = host.url().split('/t/')[1];
  log('table', code);
  await host.waitForTimeout(1200);
  await host.shot('03-invite');

  // ---- guest scans the QR ----
  step = 'join';
  await guest.goto(`${BASE}/t/${code}`);
  await guest.waitForSelector('[data-screen=join]');
  await guest.waitForTimeout(900);
  await guest.shot('01-join');
  await guest.fill('#g-handle', 'ana_lx');
  if (ACC) await testLogin(guest, 'ana:Ana');
  else { await guest.fill('#g-name', 'Ana'); await guest.click('[data-act=join]'); }
  await guest.waitForSelector('[data-screen=wait]');
  await host.waitForFunction(() => document.querySelector('.jc') && document.querySelector('.jc').textContent === '2');
  await guest.shot('02-wait');
  await tom.goto(`${BASE}/t/${code}`);
  await tom.waitForSelector('[data-screen=join]');
  await tom.fill('#g-name', 'Tom');
  await tom.click('[data-act=join]');
  await tom.waitForSelector('[data-screen=wait]');
  await host.waitForFunction(() => document.querySelector('.jc') && document.querySelector('.jc').textContent === '3');
  await host.shot('04-invite-joined');

  // ---- host scans the receipt ----
  step = 'receipt';
  await host.click('[data-act=scan]');
  await host.waitForSelector('[data-screen=receipt] #pick-rc', { state: 'attached' });
  await guest.waitForFunction(() => /scanning/.test(document.querySelector('.wl-t').textContent));
  await host.setInputFiles('#pick-rc', fx('receipt.jpg'));
  await host.waitForSelector('.photo-scan');
  await host.shot('05-reading');
  await host.waitForSelector('.rcpt.review', { timeout: 30000 });
  await host.waitForTimeout(2600);
  log('review:', (await host.textContent('.check')).trim());
  await host.shot('06-review');
  await host.click('[data-act=tip][data-tip="5"]');
  await host.click('[data-act=send]');

  // ---- everyone claims ----
  step = 'claim';
  await guest.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  await host.waitForSelector('[data-screen=live]');
  const tap = async (pg, text) => { await pg.locator('.rcpt.claim .rc-line', { hasText: text }).first().click(); await pg.waitForTimeout(350); };
  for (const t of ['BACALHAU', 'VINHO VERDE', 'COUVERT', 'BICA', 'PASTEL']) await tap(guest, t);
  await guest.shot('03-claimed');
  await tom.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  for (const t of ['SALADA', 'IMPERIAL', 'COUVERT']) await tap(tom, t);
  for (const t of ['POLVO', 'VINHO VERDE', 'COUVERT', 'IMPERIAL']) await tap(host, t);
  await host.shot('07-mypart');
  log('guest part:', await guest.textContent('.yp-v'), '| host part:', await host.textContent('.yp-v'));
  await guest.click('[data-act=done]');
  await tom.click('[data-act=done]');
  await host.waitForTimeout(500);
  await host.click('[data-act=done]');
  // Everyone is done: the host is offered a round, or closing the receipt. Close it.
  await host.waitForSelector('.sheet-foot .foot-close:not([hidden])', { timeout: 10000 });
  await host.click('.sheet-foot .foot-close');
  await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Paying back', null, { timeout: 10000 });
  await host.waitForTimeout(900);
  await host.shot('08-live-settling');

  // ---- Tom pays cash, Carlos confirms it ----
  step = 'cash';
  await tom.waitForSelector('[data-act=pay]:not([disabled])', { timeout: 10000 });
  await tom.click('[data-act=pay]');
  await tom.waitForSelector('[data-screen=pay]');
  await tom.click('[data-act=cash]');
  await tom.waitForSelector('[data-screen=paid]');
  log('tom:', (await tom.textContent('.paid-h h1')).trim());
  await host.waitForSelector('.prow[data-id=P3] .pr-st[data-act=confirm]', { timeout: 10000 });
  await host.shot('08b-confirm-cash');
  await host.click('.prow[data-id=P3] .pr-st[data-act=confirm]');
  await tom.waitForFunction(() => /quits with/.test(document.querySelector('.paid-h h1').textContent), null, { timeout: 10000 });
  log('tom after confirm:', (await tom.textContent('.paid-h h1')).trim());
  if (ACC) {
    // Tom joined without an account; after paying he keeps the night by signing in
    await tom.waitForSelector('.keep .gtest');
    await tom.shot('01-keep-card');
    await testLogin(tom, 'tom:Tom');
    await tom.waitForFunction(() => !document.querySelector('.keep') && /in your profile/.test(document.querySelector('.paid-body .note').textContent), null, { timeout: 10000 });
    const nightsOfTom = await tom.evaluate(async () => (await (await fetch('/api/me', { headers: { authorization: 'Bearer ' + JSON.parse(localStorage.getItem('quits:session')) } })).json()).user.nights.map(n => n.code));
    log('tom kept the night in his account:', nightsOfTom.includes(code));
  }

  // ---- guest pays back on testnet, sending it by hand with the memo ----
  step = 'pay';
  await guest.waitForSelector('[data-act=pay]:not([disabled])', { timeout: 10000 });
  await guest.shot('04-pay-button');
  await guest.click('[data-act=pay]');
  await guest.waitForSelector('[data-screen=pay]');
  if (await guest.$('[data-act=asset][data-asset=USDC]')) await guest.click('[data-act=asset][data-asset=USDC]');
  await guest.click('[data-act=manual]');
  await guest.waitForSelector('.manual .cprow');
  const rows = await guest.$$eval('.manual .cprow b', bs => bs.map(b => b.textContent));
  log('open-in-wallet link:', ((await guest.getAttribute('.manual .open-wallet', 'href')) || 'none').slice(0, 60) + '…');
  const amount = rows[1].split(' ')[0], memo = rows[2];
  log('guest owes', rows[1], 'memo', JSON.stringify(memo));
  await guest.shot('05-pay-manual');
  const kp = Keypair.fromSecret(keys.guest.sec), acct = await hz.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: keys.host.pub, asset: USDC, amount })).addMemo(Memo.text(memo)).setTimeout(60).build();
  tx.sign(kp);
  const sent = await hz.submitTransaction(tx);
  log('sent on testnet', sent.hash.slice(0, 10));
  await guest.waitForSelector('[data-screen=paid]', { timeout: 40000 });
  log('guest sees paid');
  await host.waitForSelector('.qm', { timeout: 20000 });
  await host.waitForTimeout(2200);
  await host.shot('09-quits');
  await guest.waitForTimeout(1500);
  await guest.shot('06-paid');

  // ---- the night ----
  step = 'night';
  await host.click('[data-qm=night]');
  await host.waitForSelector('[data-screen=memory]');
  await guest.click('[data-act=night]');
  await guest.waitForSelector('[data-screen=memory]');
  await guest.setInputFiles('#mem-photo', fx('sign.jpg'));
  await host.waitForSelector('.pgrid .ph', { timeout: 15000 });
  await host.waitForTimeout(1500);
  await host.shot('10-night');
  await host.click('[data-act=share]');
  await host.waitForTimeout(900);
  await host.shot('11-share');

  // ---- a stranger opens the shared night: no handles, no amounts ----
  step = 'public';
  const stranger = await phone('stranger', 'Pixel 7');
  await stranger.goto(`${BASE}/n/${code}`);
  await stranger.waitForSelector('[data-screen=memory]');
  const leaks = await stranger.evaluate(() => ({ handles: document.querySelectorAll('.mp-h').length, amounts: document.querySelectorAll('.mp-amt').length }));
  log('public night view:', JSON.stringify(leaks));
  const html = await (await fetch(`${BASE}/n/${code}`)).text();
  log('preview title:', (html.match(/<meta property="og:title" content="([^"]*)"/) || [])[1]);

  // ---- back home: the night is kept on the phone ----
  step = 'home-after';
  await host.goto(BASE + '/');
  await host.waitForSelector('.stub');
  await host.shot('12-home');
  if (ACC) {
    // Ana signs in on a new phone: the night comes with her account
    step = 'new-phone';
    const ana2 = await phone('ana2', 'Pixel 7');
    await ana2.goto(BASE + '/');
    await ana2.waitForSelector('[data-screen=welcome]');
    await testLogin(ana2, 'ana:Ana');
    await ana2.waitForSelector('[data-screen=code], [data-screen=home]');
    if (await ana2.$('[data-screen=code]')) await ana2.click('[data-act=skip]');
    await ana2.waitForSelector('.stub', { timeout: 15000 });
    log('ana on a new phone sees:', (await ana2.textContent('.stub .stub-name')).trim(), '|', (await ana2.textContent('.stub .stub-meta')).trim());
    await ana2.click('.stub');
    await ana2.waitForSelector('[data-screen=memory], [data-screen=paid]', { timeout: 15000 });
    log('ana opens it as:', await ana2.evaluate(() => document.querySelector('.scr:last-of-type').dataset.screen));
    await ana2.shot('01-night-on-new-phone');
  }
  log('OK');
} catch (e) {
  log('FAILED at', step, e.message.split('\n')[0]);
  await host.shot('zz-fail').catch(() => {});
  await guest.shot('zz-fail').catch(() => {});
  process.exitCode = 1;
} finally {
  for (const [n, p] of [['host', host], ['guest', guest], ['tom', tom]]) if (p.errors.length) log(n, 'console errors:', p.errors.slice(0, 6));
  await browser.close();
}
