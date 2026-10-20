// Reads a real receipt photo through the local worker with the real model, and prints what came back and what it cost.
import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8787';
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const file = process.argv[2] || new URL('./fixtures/receipt.jpg', import.meta.url).pathname;
const img = 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64');
async function call(path, body, creds) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + JSON.stringify(j)); return j;
}
const t0 = Date.now();
const t = await call('/api/tables', { name: 'AI test', hostName: 'Carlos', address: keys.host.pub });
const host = { pid: t.pid, token: t.token };
const rc = await call(`/api/t/${t.code}/receipt`, { image: img }, host);
const ms = Date.now() - t0;
console.log('readable', rc.readable, 'venue', JSON.stringify(rc.venue), 'currency', rc.currency, 'printed total', rc.total / 100, 'lines', rc.lines.length, 'sum', rc.lines.reduce((a, l) => a + l.total, 0) / 100, `${ms} ms`);
for (const l of rc.lines) console.log(String(l.qty).padStart(2), l.name.padEnd(26), (l.total / 100).toFixed(2).padStart(7), l.kind.padEnd(6), l.en);
const u = rc.usage || {};
const cost = (u.input_tokens || 0) * 0.10 / 1e6 + (u.output_tokens || 0) * 0.50 / 1e6;
console.log('usage', JSON.stringify(u), 'cost ≈ $' + cost.toFixed(5));
