// "Who pays?" in three real browsers against the local worker: the round from the host's proposal to the
// result, then the loser pays. node test/game-ui.mjs  (needs `wrangler dev` on :8787 and AI_MOCK=1)
import { chromium, devices } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE = process.env.BASE || 'http://localhost:8787';
const INVITE = process.env.INVITE || (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const SHOTS = process.env.SHOTS || path.join(process.env.TMPDIR || '/tmp', 'quits-game-shots');
fs.mkdirSync(SHOTS, { recursive: true });
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const fx = f => new URL('./fixtures/' + f, import.meta.url).pathname;
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
const HEALTH = await (await fetch(BASE + '/api/health')).json();
if (HEALTH.accounts) throw new Error('run with accounts off (GOOGLE_CLIENT_ID= in .dev.vars)');
log('game contract:', HEALTH.game && HEALTH.game.contract);

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
const ana = await phone('ana', 'Pixel 7');
const tom = await phone('tom', 'iPhone 13');
let step = 'start';
try {
  step = 'open table';
  await host.goto(BASE + '/');
  await host.waitForSelector('[data-screen=welcome]');
  await host.click('[data-act=start]');
  await host.waitForSelector('[data-screen=home]'); await host.getByRole('button', { name: 'Open a table' }).click();
  await host.waitForSelector('[data-screen=code]');
  await host.fill('#inv-code', INVITE); await host.click('[data-act=go]');
  await host.waitForSelector('[data-screen=snap]');
  await host.setInputFiles('#pick-cover', fx('sign.jpg'));
  await host.waitForFunction(() => document.querySelector('#ev-name') && document.querySelector('#ev-name').value.length > 3, null, { timeout: 20000 });
  await host.fill('#host-name', 'Carlos'); await host.fill('#host-addr', keys.host.pub);
  await host.click('[data-act=open]');
  await host.waitForSelector('[data-screen=invite]', { timeout: 20000 });
  const code = host.url().split('/t/')[1];
  log('table', code);
  step = 'join';
  for (const [pg, name] of [[ana, 'Ana'], [tom, 'Tom']]) {
    await pg.goto(`${BASE}/t/${code}`); await pg.waitForSelector('[data-screen=join]');
    await pg.fill('#g-name', name); await pg.click('[data-act=join]'); await pg.waitForSelector('[data-screen=wait]');
  }
  await host.waitForFunction(() => document.querySelector('.jc') && document.querySelector('.jc').textContent === '3');
  step = 'receipt';
  await host.click('[data-act=scan]');
  await host.waitForSelector('[data-screen=receipt] #pick-rc', { state: 'attached' });
  await host.setInputFiles('#pick-rc', fx('receipt.jpg'));
  await host.waitForSelector('.rcpt.review', { timeout: 30000 });
  await host.click('[data-act=send]');
  step = 'claim';
  await ana.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  await tom.waitForSelector('[data-screen=claim] .rcpt.claim', { timeout: 15000 });
  await host.waitForSelector('[data-screen=live]');
  const tap = async (pg, i) => { await pg.locator('.rcpt.claim .rc-line').nth(i).click(); await pg.waitForTimeout(300); };
  await tap(ana, 0); await tap(ana, 1); await tap(tom, 2); await tap(tom, 3);
  await host.click('[data-act=tab][data-tab=mine]'); await host.waitForTimeout(400); await tap(host, 4);
  await host.click('[data-act=tab][data-tab=table]');
  await host.waitForSelector('[data-act=round]');
  await host.shot('01-live-before');

  // ---- the round ----
  step = 'propose';
  await host.click('[data-act=round]');
  await host.waitForSelector('.sheet.game [data-g=start]');
  await host.shot('02-propose');
  await ana.waitForSelector('.sheet.game [data-g=in]', { timeout: 10000 });
  await ana.shot('02-invited');
  await host.click('.sheet.game [data-g=in]'); await ana.click('.sheet.game [data-g=in]'); await tom.click('.sheet.game [data-g=in]');
  await host.waitForSelector('.sheet.game [data-g=start]:not([disabled])');
  await host.waitForFunction(() => document.querySelectorAll('.gans.yes').length === 3);
  await host.shot('03-all-in');
  step = 'start';
  await host.click('.sheet.game [data-g=start]');
  await host.waitForSelector('.sheet.game [data-g=seal]', { timeout: 30000 });
  log('round started on chain');
  step = 'seal';
  const move = async (pg, coins, guess, who) => {
    await pg.waitForSelector('.sheet.game [data-g=seal]', { timeout: 30000 });
    for (let i = 0; i < coins; i++) await pg.click('.sheet.game [data-g=coins][data-d="1"]');
    const cur = Number(await pg.textContent('.gguess'));
    for (let i = 0; i < Math.abs(guess - cur); i++) await pg.click(`.sheet.game [data-g=guess][data-d="${guess > cur ? 1 : -1}"]`);
    await pg.shot(`04-move-${who}`);
    await pg.click('.sheet.game [data-g=seal]');
    await pg.waitForSelector('.sheet.game .gh', { timeout: 15000 });
    await pg.waitForFunction(() => /Sealed/.test(document.querySelector('.sheet.game h2').textContent), null, { timeout: 15000 });
  };
  await move(host, 2, 4, 'host');
  await host.shot('05-sealed-waiting');
  await move(ana, 1, 3, 'ana');
  await move(tom, 3, 9, 'tom');
  log('all sealed; waiting for the chain');
  step = 'opening';
  await host.waitForFunction(() => /Opening|pays/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 60000 });
  await host.shot('06-opening');
  step = 'result';
  await host.waitForFunction(() => /pays|You pay/.test(document.querySelector('.sheet.game h2') ? document.querySelector('.sheet.game h2').textContent : ''), null, { timeout: 90000 });
  await host.waitForTimeout(800);
  await host.shot('07-result-host'); await ana.shot('07-result-ana'); await tom.shot('07-result-tom');
  const verdict = (await host.textContent('.sheet.game .gres')).replace(/\s+/g, ' ').trim();
  log('result:', verdict);
  const st = (await (await fetch(`${BASE}/api/t/${code}/state`)).json()).s;
  const loser = st.game.outcome.loser;
  log('loser', st.people[loser].name, 'total', st.game.outcome.total, st.game.outcome.reason, 'settle tx', st.game.txs.settle && st.game.txs.settle.tx);
  for (const pg of [host, ana, tom]) await pg.click('.sheet.game [data-g=ok]');
  await host.waitForTimeout(600);
  await host.shot('08-live-after');

  // ---- close the receipt: only the loser pays ----
  step = 'settle';
  await ana.click('[data-act=done]'); await tom.click('[data-act=done]');
  await host.click('[data-act=close]');
  await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Paying back', null, { timeout: 10000 });
  await host.waitForTimeout(900);
  await host.shot('09-live-settling');
  const pages = { [st.host]: host, P2: ana, P3: tom };
  const names = { [st.host]: 'host', P2: 'ana', P3: 'tom' };
  for (const id of ['P2', 'P3']) {
    const pg = pages[id];
    if (id === loser) { await pg.waitForSelector('[data-act=pay]:not([disabled])', { timeout: 10000 }); await pg.click('[data-act=pay]'); await pg.waitForSelector('[data-screen=pay]'); await pg.shot('10-pay-loser'); await pg.click('[data-act=cash]'); await pg.waitForSelector('[data-screen=paid]'); }
    else { await pg.waitForSelector('[data-screen=free]', { timeout: 10000 }); await pg.shot(`10-free-${names[id]}`); }
  }
  if (loser !== st.host) { await host.waitForSelector('.pr-st.confirm', { timeout: 10000 }); await host.click('.pr-st.confirm'); }
  await host.waitForFunction(() => document.querySelector('.lv-st') && document.querySelector('.lv-st').textContent === 'Settled', null, { timeout: 10000 });
  await host.waitForTimeout(1500);
  await host.shot('11-settled');
  await host.goto(`${BASE}/n/${code}`); await host.waitForSelector('[data-screen=memory]'); await host.waitForTimeout(1200);
  await host.shot('12-night');
  log('night has the round:', !!(await host.$('.gcard')));
  for (const [n, pg] of Object.entries({ host, ana, tom })) if (pg.errors.length) log(`${n} console errors:`, pg.errors.slice(0, 3));
  log('OK');
} catch (e) {
  log('FAILED at', step, e.message.split('\n')[0]);
  for (const [n, pg] of Object.entries({ host, ana, tom })) { try { await pg.shot('fail'); } catch (err) { /* gone */ } if (pg.errors.length) log(`${n} console errors:`, pg.errors.slice(0, 5)); }
  process.exitCode = 1;
} finally { await browser.close(); }
