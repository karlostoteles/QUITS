// On a phone, picking LOBSTR in the wallet sheet must open its universal link with the WalletConnect URI.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8787';
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
const page = await ctx.newPage();
const opened = [];
await page.route(/lobstr\.co|freighterwallet:|scopuly:/, route => { opened.push(route.request().url()); route.abort(); });
page.on('console', m => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 140)); });
page.on('requestfailed', r => { if (!/localhost/.test(r.url())) console.log('request failed:', r.url().slice(0, 100), r.failure() && r.failure().errorText); });
await page.goto(BASE + '/');
await page.evaluate(() => { try { localStorage.setItem('quits:welcomed', '1'); localStorage.setItem('quits:invite', JSON.stringify('TEST-0000')); } catch (e) {} });
await page.goto(BASE + '/new');
await page.waitForSelector('[data-screen="snap"]');
await page.click('[data-act="skip"]');
await page.waitForTimeout(500);
await page.click('[data-act="wallet"]');
const modal = page.locator('w3m-modal');
await modal.waitFor({ timeout: 30000 });
await page.waitForFunction(() => { const walk = r => [...r.querySelectorAll('*')].some(el => (el.tagName === 'WUI-WALLET-IMAGE' && /LOBSTR/i.test(el.getAttribute('name') || '')) || (el.shadowRoot && walk(el.shadowRoot))); return walk(document); }, null, { timeout: 60000 });
await page.screenshot({ path: 'docs/screens/_wc-modal.png' });
const names = await page.evaluate(() => {
  const out = []; const walk = r => { r.querySelectorAll('*').forEach(el => { if (/^WUI-LIST-WALLET|^WUI-LIST-ITEM|^WUI-WALLET|^W3M-ALL-WALLETS-LIST-ITEM|^WUI-CARD-SELECT/.test(el.tagName)) out.push(el.tagName + ':' + (el.getAttribute('name') || el.name || el.textContent.trim().slice(0, 30))); if (el.shadowRoot) walk(el.shadowRoot); }); };
  walk(document); return out;
});
console.log('wallets listed:', names);
const clicked = await page.evaluate(() => {
  let hit = null; const walk = r => { r.querySelectorAll('*').forEach(el => { if (!hit && el.tagName === 'W3M-ALL-WALLETS-LIST-ITEM') { const img = el.shadowRoot && el.shadowRoot.querySelector('wui-wallet-image'); if (img && /LOBSTR/i.test(img.getAttribute('name') || '')) hit = el; } if (!hit && el.shadowRoot) walk(el.shadowRoot); }); };
  walk(document); if (hit) { (hit.shadowRoot.querySelector('button') || hit).click(); return true; } return false;
});
console.log('clicked LOBSTR:', clicked);
await page.waitForTimeout(3000);
console.log('opened:', opened.map(u => u.slice(0, 90)));
const ok = opened.some(u => /^https:\/\/lobstr\.co\/uni\/wc\?uri=wc%3A/.test(u));
console.log(ok ? 'PASS: LOBSTR opened through https://lobstr.co/uni/wc?uri=…' : 'FAIL');
await browser.close();
