// "Who pays?" from three phones, through the API, against a running worker (wrangler dev on :8787).
// The round is relayed to the whopays contract on testnet; the loser ends up owing the players' parts.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import fs from 'fs';
import { commitmentOf, sealMessage, hex, unhex, randomBytes, judge } from '../src/shared/game.js';
import { shares, gameFree } from '../src/shared/logic.js';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const BASE = process.env.BASE || 'http://localhost:8787';
const INVITE = (fs.readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/INVITE_CODES=([^,\n]+)/) || [])[1];
const img = 'data:image/png;base64,' + fs.readFileSync(new URL('./tiny.png', import.meta.url)).toString('base64');
const t0 = Date.now(), log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);
async function call(path, body, creds) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-quits-invite': INVITE, ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(path + ' ' + r.status + ' ' + JSON.stringify(j)); return j;
}
const state = async () => (await call(`/api/t/${code}/state`)).s;
const until = async (pred, ms = 90000) => { const t = Date.now(); while (Date.now() - t < ms) { const s = await state(); if (pred(s)) return s; await new Promise(r => setTimeout(r, 1500)); } throw new Error('timed out waiting'); };

// A phone: a seat at the table plus a key for the round.
const phone = (creds, name) => { const priv = ed.utils.randomPrivateKey(); return { ...creds, name, priv, pk: hex(ed.getPublicKey(priv)) }; };
// The host's wallet: a fresh testnet account with a USDC trustline (kept in test/.keys.json between runs).
import { Keypair, Horizon, TransactionBuilder, Operation, Asset, Networks } from '@stellar/stellar-sdk';
const KEYS = new URL('./.keys.json', import.meta.url);
let keys = fs.existsSync(KEYS) ? JSON.parse(fs.readFileSync(KEYS, 'utf8')) : {};
if (!keys.host) {
  const kp = Keypair.random();
  await fetch(`https://friendbot.stellar.org/?addr=${kp.publicKey()}`);
  const hz = new Horizon.Server('https://horizon-testnet.stellar.org');
  const acct = await hz.loadAccount(kp.publicKey());
  const tx = new TransactionBuilder(acct, { fee: '1000', networkPassphrase: Networks.TESTNET }).addOperation(Operation.changeTrust({ asset: new Asset('USDC', 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5') })).setTimeout(60).build();
  tx.sign(kp); await hz.submitTransaction(tx);
  keys.host = { pub: kp.publicKey(), sec: kp.secret() };
  fs.writeFileSync(KEYS, JSON.stringify(keys, null, 2));
}
const HOST_ADDR = keys.host.pub;

const t = await call('/api/tables', { name: 'Tasca do Beato', hostName: 'Carlos', color: '#FFE45C', address: HOST_ADDR, cover: img });
const code = t.code;
const host = phone({ pid: t.pid, token: t.token }, 'Carlos');
const ana = phone(await call(`/api/t/${code}/join`, { name: 'Ana', color: '#FF8AC2' }), 'Ana');
const tom = phone(await call(`/api/t/${code}/join`, { name: 'Tom', color: '#7FD3FF' }), 'Tom');
log('table', code, 'seats', host.pid, ana.pid, tom.pid);
const rc = await call(`/api/t/${code}/receipt`, { image: img }, host);
let r = await call(`/api/t/${code}/act`, { type: 'publish', lines: rc.lines, tip: 0, imageId: rc.imageId, printedTotal: rc.total }, host);
const ids = r.s.receipt.lines.map(l => l.id);
await call(`/api/t/${code}/act`, { type: 'claim', lid: ids[0], delta: 1 }, host);
await call(`/api/t/${code}/act`, { type: 'claim', lid: ids[1], delta: 1 }, ana);
await call(`/api/t/${code}/act`, { type: 'claim', lid: ids[2], delta: 1 }, tom);
let sh = shares(await state());
log('parts before the round:', Object.fromEntries(Object.entries(sh.total)));

// ---- the round ----
r = await call(`/api/t/${code}/act`, { type: 'gameAsk' }, host);
log('host asks: status', r.s.game.status);
for (const p of [host, ana, tom]) await call(`/api/t/${code}/act`, { type: 'gameAnswer', yes: true, pk: p.pk }, p);
log('everyone is in');
r = await call(`/api/t/${code}/act`, { type: 'gameStart' }, host);
const g = r.s.game;
log('started on chain:', g.status, 'create tx', g.txs.create.tx.slice(0, 10), 'players', g.players.join(','));
const moves = { [host.pid]: [1, 4], [ana.pid]: [3, 5], [tom.pid]: [0, 2] };
const secrets = {};
for (const p of [host, ana, tom]) {
  const [coins, guess] = moves[p.pid], salt = randomBytes(32);
  const c = await commitmentOf(unhex(g.id), unhex(p.pk), coins, guess, salt);
  const sig = ed.sign(sealMessage(unhex(g.id), c), p.priv);
  secrets[p.pid] = { coins, guess, salt: hex(salt) };
  r = await call(`/api/t/${code}/act`, { type: 'gameSeal', commitment: hex(c), sig: hex(sig) }, p);
  log(`${p.name} sealed (${coins} coins, says ${guess})`);
}
// A forged seal must be refused by the Worker before it reaches the chain.
try { await call(`/api/t/${code}/act`, { type: 'gameSeal', commitment: hex(randomBytes(32)), sig: hex(randomBytes(64)) }, ana); log('UNEXPECTED: forged seal accepted'); } catch (e) { log('forged/second seal refused:', /already|signed/.test(e.message) ? 'ok' : e.message); }
let s = await until(x => x.game.status === 'opening');
log('all sealed on chain, reveals open until ledger', s.game.revealUntil, 'seal txs', s.game.txs.seal.map(x => x.tx.slice(0, 8)).join(' '));
// A wrong opening is refused.
try { await call(`/api/t/${code}/act`, { type: 'gameOpen', coins: 2, guess: 9, salt: secrets[ana.pid].salt }, ana); log('UNEXPECTED: wrong opening accepted'); } catch (e) { log('wrong opening refused:', /not the move/.test(e.message) ? 'ok' : e.message); }
for (const p of [host, ana, tom]) { await call(`/api/t/${code}/act`, { type: 'gameOpen', ...secrets[p.pid] }, p); log(`${p.name} opened`); }
s = await until(x => x.game.status === 'done' || x.game.status === 'cancelled');
const o = s.game.outcome;
log('settled:', s.game.status, 'loser', s.people[o.loser].name, 'total', o.total, o.reason, o.drawn ? '(drawn)' : '', 'tx', (s.game.txs.settle || {}).tx);
const expect = judge({ active: s.game.active.map(id => s.game.players.indexOf(id)), moves: Object.fromEntries(s.game.players.map((id, i) => [i, secrets[id]])) });
log('judge agrees:', expect.pool.includes(s.game.players.indexOf(o.loser)) && expect.total === o.total ? 'yes' : 'NO');
sh = shares(s);
log('parts after the round:', Object.fromEntries(Object.entries(sh.total)), 'free:', [host, ana, tom].filter(p => gameFree(s, p.pid)).map(p => p.name).join(','));

// ---- the table settles: only the loser owes (unless the loser is the host, who paid the bill) ----
for (const p of [host, ana, tom]) r = await call(`/api/t/${code}/act`, { type: 'ready' }, p);
log('after everyone is ready: phase', r.s.phase, 'owing', shares(r.s).owing);
if (r.s.phase === 'settling') {
  const owing = r.s.order.filter(id => id !== r.s.host && shares(r.s).total[id] > 0);
  for (const id of owing) { const p = [ana, tom].find(x => x.pid === id); await call(`/api/t/${code}/act`, { type: 'cash' }, p); await call(`/api/t/${code}/act`, { type: 'confirmCash', who: id }, host); }
  s = await state();
  log('after the loser pays in cash: phase', s.phase);
}
console.log('OK');
