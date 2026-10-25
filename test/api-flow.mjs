// End-to-end API test against a running worker: table, join, receipt, claims, testnet payment (wallet path + memo path).
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Memo, Networks } from '@stellar/stellar-sdk';
import fs from 'fs';
const BASE = process.env.BASE || 'http://localhost:8787';
const keys = JSON.parse(fs.readFileSync(new URL('./.keys.json', import.meta.url)));
const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
const ASSET = { EURC: new Asset('EURC', 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO'), USDC: new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5') };
const img = 'data:image/png;base64,' + fs.readFileSync(new URL('./tiny.png', import.meta.url)).toString('base64');
const INVITE = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
async function call(path, body, creds) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-quits-invite': INVITE, ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + JSON.stringify(j)); return j;
}
async function pay(who, to, asset, amount, memo) {
  const kp = Keypair.fromSecret(keys[who].sec), acct = await hz.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET }).addOperation(Operation.payment({ destination: to, asset: ASSET[asset], amount })).addMemo(Memo.text(memo)).setTimeout(60).build();
  tx.sign(kp); const r = await hz.submitTransaction(tx); return r.hash;
}
const sign = await call('/api/sign', { image: img }); console.log('sign read:', sign);
const t = await call('/api/tables', { name: sign.name, hostName: 'Carlos', color: '#FFE45C', address: keys.host.pub, cover: img });
const code = t.code, host = { pid: t.pid, token: t.token }; console.log('table', code, 'host', host.pid, 'accept', t.s.accept);
const ana = await call(`/api/t/${code}/join`, { name: 'Ana', color: '#FF8AC2', contact: '@ana' });
const tom = await call(`/api/t/${code}/join`, { name: 'Tom', color: '#7FD3FF' });
console.log('joined', ana.pid, tom.pid);
const rc = await call(`/api/t/${code}/receipt`, { image: img }, host); console.log('receipt lines', rc.lines.length, 'total', rc.total, 'mock', rc.mock);
let r = await call(`/api/t/${code}/act`, { type: 'publish', lines: rc.lines, tip: 5, imageId: rc.imageId, printedTotal: rc.total }, host);
console.log('phase', r.s.phase, 'rate', r.s.rate);
const ids = Object.fromEntries(r.s.receipt.lines.map(l => [l.name, l.id]));
const claim = (c, name, d = 1) => call(`/api/t/${code}/act`, { type: 'claim', lid: ids[name], delta: d }, c);
for (const n of ['POLVO À LAGAREIRO', 'IMPERIAL', 'VINHO VERDE GARRAFA', 'COUVERT']) await claim(host, n);
for (const n of ['BACALHAU À BRÁS', 'VINHO VERDE GARRAFA', 'COUVERT', 'BICA']) await claim(ana, n);
for (const n of ['PREGO NO PÃO', 'COUVERT', 'IMPERIAL']) await claim(tom, n);
for (const c of [host, ana]) await call(`/api/t/${code}/act`, { type: 'ready' }, c);
r = await call(`/api/t/${code}/act`, { type: 'ready' }, tom);
console.log('after all ready:', r.s.phase, 'leftover', r.s.leftover, '(the host decides: a round, or closing)');
if (r.s.phase === 'claiming') r = await call(`/api/t/${code}/act`, { type: 'close' }, host);
console.log('after the host closes:', r.s.phase);
// Ana pays through the wallet path (reports the hash)
r = await call(`/api/t/${code}/act`, { type: 'intent', asset: 'USDC' }, ana);
const ia = r.s.intents[ana.pid]; console.log('ana owes', ia.amount, ia.asset, 'memo', JSON.stringify(ia.memo));
const h1 = await pay('guest', keys.host.pub, 'USDC', ia.amount, ia.memo); console.log('ana paid tx', h1.slice(0, 12));
r = await call(`/api/t/${code}/act`, { type: 'paid', tx: h1, wallet: 'Freighter' }, ana); console.log('verify ->', r.ok, r.why || '', 'ana paid:', !!r.s?.paid?.[ana.pid]);
// Tom pays by hand with the memo; the table should find it on its own
r = await call(`/api/t/${code}/act`, { type: 'intent', asset: 'USDC' }, tom);
const it = r.s.intents[tom.pid]; console.log('tom owes', it.amount, it.asset, 'memo', JSON.stringify(it.memo));
const h2 = await pay('guest', keys.host.pub, 'USDC', it.amount, it.memo); console.log('tom paid tx', h2.slice(0, 12));
let st;
for (let i = 0; i < 12; i++) { await new Promise(res => setTimeout(res, 2500)); st = (await call(`/api/t/${code}/state`)).s; if (st.paid[tom.pid]) break; }
console.log('detected tom:', !!st.paid[tom.pid], 'phase', st.phase, 'settled at', st.tSettled ? 'yes' : 'no');
console.log(JSON.stringify(Object.fromEntries(Object.entries(st.paid).map(([k, v]) => [k, `${v.amount} ${v.asset} ${v.tx.slice(0, 8)}`]))));
