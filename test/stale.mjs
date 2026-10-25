// A page left open across a deploy reloads itself; a lost chunk mid-form becomes a clear message.
import { chromium } from 'playwright';
const BASE = 'http://localhost:8787';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') console.log('console error:', m.text().slice(0, 160)); });
await page.goto(BASE + '/');
await page.evaluate(() => { try { localStorage.setItem('quits:welcomed', '1'); localStorage.setItem('quits:invite', JSON.stringify('TEST-0000')); } catch (e) {} });
await page.goto(BASE + '/');
await page.waitForSelector('[data-screen]');
const html = await (await fetch(BASE + '/')).text();
const main = /\/assets\/(main-[^/"]+\.js)/.exec(html)[1];
console.log('screen', await page.getAttribute('[data-screen]', 'data-screen'), 'build', main);

// 1. a deploy happens: "/" now names another main bundle
let reloaded = false;
await page.route(BASE + '/', route => route.fulfill({ status: 200, contentType: 'text/html', body: html.replace(main, 'main-NEWBUILD.js') }));
page.on('framenavigated', f => { if (f === page.mainFrame()) reloaded = true; });
await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await page.waitForTimeout(1500);
console.log(reloaded ? 'PASS: the page reloaded itself on the home screen' : 'FAIL: no reload');
await page.unroute(BASE + '/');

// 2. the wallet chunk is gone while a photo is on the form: a message, no reload
await page.goto(BASE + '/');
await page.waitForSelector('[data-screen="home"]');
await page.evaluate(() => localStorage.setItem('quits:reloaded', String(Date.now()))); // as if it had just reloaded: no second reload within a minute
const mainJs = await (await fetch(BASE + '/assets/' + main)).text();
const lazyChunk = /import\("\.\/(c-[A-Z0-9]+\.js)"\)/.exec(mainJs)[1]; // the wallet code, loaded on demand
await page.route('**/assets/' + lazyChunk, route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
await page.goto(BASE + '/new');
await page.waitForSelector('[data-screen="snap"]');
await page.waitForTimeout(800);
await page.click('[data-act="skip"]');
await page.waitForTimeout(400);
reloaded = false;
await page.click('[data-act="wallet"]');
await page.waitForSelector('.toast', { timeout: 5000 });
const toast = await page.textContent('.toast');
await page.waitForTimeout(1200);
console.log(/Reload the page/.test(toast) && !reloaded ? 'PASS: message instead of a reload mid-form: ' + toast.trim().slice(0, 120) : 'FAIL: ' + toast + ' reloaded=' + reloaded);
await browser.close();
