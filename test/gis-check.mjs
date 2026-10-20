// Does Google's sign-in button load on the real site (origin allowed for this client ID)?
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'https://quits.aircade.xyz';
const b = await chromium.launch();
for (const [label, path] of [['welcome', '/']]) {
  const ctx = await b.newContext({ ...devices['iPhone 13'] }), pg = await ctx.newPage();
  const logs = [];
  pg.on('console', m => logs.push(`${m.type()}: ${m.text().slice(0, 200)}`));
  pg.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await pg.goto(BASE + path);
  await pg.waitForSelector('[data-screen=welcome]');
  const frame = await pg.waitForSelector('.gbtn iframe', { timeout: 20000 }).then(() => 'button iframe rendered').catch(() => 'no iframe');
  await pg.waitForTimeout(3000);
  const src = await pg.$eval('.gbtn iframe', f => f.src).catch(() => '');
  console.log(label, '→', frame, src ? new URL(src).host + new URL(src).pathname : '');
  console.log('gsi logs:', logs.filter(l => /GSI|origin|client|google/i.test(l)).slice(0, 6));
  await pg.screenshot({ path: '/tmp/claude-0/-home-claude/7ad6a8ac-ff95-5c75-b7c9-3bc1a727a40f/scratchpad/shots-prod/gis-welcome.png' });
  await ctx.close();
}
await b.close();
