// Deploys the whopays contract and plays rounds on testnet with players that live only in this
// script (keys in memory, like the keys a browser would hold).
//
//   node scripts/whopays.mjs deploy            uploads the WASM, creates the contract, logs it
//   node scripts/whopays.mjs round [players]   a full round: seal, open, settle (default 3 players)
//   node scripts/whopays.mjs silent            a round in which one player never opens: settled by timeout
//   node scripts/whopays.mjs forged            a sealed move with a wrong signature is refused
//
// The relaying account's key is in contracts/.keys/testnet.json (git-ignored, funded by friendbot).
// Results are logged in contracts/deployments/testnet.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@stellar/stellar-sdk';
import { Chain, fundOnTestnet, ContractError } from '../../src/worker/chain.js';
import { commitmentOf, sealMessage, randomBytes, hex, judge } from '../../src/shared/game.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WASM = join(ROOT, 'target/wasm32v1-none/release/whopays.optimized.wasm');
const keysDir = join(ROOT, '.keys'), logPath = join(ROOT, 'deployments/testnet.json');
const log = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : { network: 'testnet', events: [] };
const save = () => { mkdirSync(dirname(logPath), { recursive: true }); writeFileSync(logPath, JSON.stringify(log, null, 2) + '\n'); };
const record = e => { log.events.push({ at: new Date().toISOString(), ...e }); save(); };

async function keypair() {
  mkdirSync(keysDir, { recursive: true });
  const p = join(keysDir, 'testnet.json');
  if (existsSync(p)) return Keypair.fromSecret(JSON.parse(readFileSync(p, 'utf8')).secret);
  const kp = Keypair.random();
  writeFileSync(p, JSON.stringify({ public: kp.publicKey(), secret: kp.secret() }, null, 2), { mode: 0o600 });
  await fundOnTestnet(kp.publicKey());
  return kp;
}

const [cmd, arg] = process.argv.slice(2);
const kp = await keypair();
const chain = new Chain({ network: 'testnet', secret: kp.secret(), contractId: log.contract });
const tx = r => `${chain.explorer}/tx/${r.hash}`;

if (cmd === 'deploy') {
  const wasm = readFileSync(WASM);
  const d = await chain.deploy(wasm, kp.publicKey());
  Object.assign(log, { contract: d.contractId, admin: kp.publicKey(), wasm_sha256: d.wasmSha256, wasm_bytes: d.wasmBytes });
  record({ kind: 'deploy', ...d });
  console.log(`contract ${d.contractId}\n${chain.explorer}/contract/${d.contractId}\nupload ${d.uploadTx}\ncreate ${d.createTx}`);
  process.exit(0);
}
if (!log.contract) throw new Error('deploy first');

// A browser-side player: a fresh Ed25519 key and a move it keeps secret until the reveal.
function player(name, coins, guess) {
  const k = Keypair.random();
  return { name, kp: k, pk: new Uint8Array(k.rawPublicKey()), coins, guess, salt: randomBytes(32) };
}
async function seal(game, p) {
  p.commitment = await commitmentOf(game, p.pk, p.coins, p.guess, p.salt);
  p.sig = new Uint8Array(p.kp.sign(Buffer.from(sealMessage(game, p.commitment))));
  return { player: p.pk, commitment: p.commitment, sig: p.sig };
}
const open = p => ({ player: p.pk, coins: p.coins, guess: p.guess, salt: p.salt });
const show = (label, r) => console.log(`${label}: ledger ${r.ledger}, ${r.instructions.toLocaleString('en')} instructions, fee ${(r.fee / 1e7).toFixed(5)} XLM\n  ${tx(r)}`);

const n = Math.max(2, Math.min(24, Number(arg) || 3));
const game = randomBytes(32);
const players = Array.from({ length: n }, (_, i) => player(`P${i + 1}`, Math.floor(Math.random() * 4), Math.floor(Math.random() * (3 * n + 1))));
console.log(`round ${hex(game).slice(0, 12)}… with ${n} players on ${log.contract}`);
players.forEach(p => console.log(`  ${p.name} hides ${p.coins}, says ${p.guess}`));

const revealLedgers = cmd === 'silent' ? 10 : 36;
const c = await chain.create(game, players.map(p => p.pk), 3, 120, revealLedgers);
show('create', c);

if (cmd === 'forged') {
  const sealed = await seal(game, players[0]);
  sealed.sig = new Uint8Array(Keypair.random().sign(Buffer.from(sealMessage(game, sealed.commitment))));
  try { await chain.commitMany(game, [sealed]); console.log('UNEXPECTED: accepted'); } catch (e) { console.log(`forged seal refused: ${e.detail || e.message}`); }
  record({ kind: 'forged', game: hex(game), create_tx: c.hash, refused: true });
  process.exit(0);
}

const sealed = [];
for (const p of players) sealed.push(await seal(game, p));
const s1 = await chain.commitMany(game, sealed.slice(0, 1));
show(`seal ${players[0].name}`, s1);
const s2 = await chain.commitMany(game, sealed.slice(1));
show(`seal the other ${n - 1} in one transaction`, s2);
console.log(`  phase ${s2.game.phase} (1 = reveals open until ledger ${s2.game.revealUntil})`);

const opening = cmd === 'silent' ? players.slice(0, -1) : players;
const r1 = await chain.revealMany(game, opening.slice(0, 1).map(open));
show(`open ${opening[0].name}`, r1);
let fin = await chain.revealMany(game, opening.slice(1).map(open));
show(`open the other ${opening.length - 1}`, fin);

if (cmd === 'silent') {
  console.log(`${players[n - 1].name} stays silent; waiting for ledger ${fin.game.revealUntil}…`);
  while ((await chain.ledger()) <= fin.game.revealUntil) await new Promise(r => setTimeout(r, 5000));
  try { await chain.revealMany(game, [open(players[n - 1])]); console.log('UNEXPECTED: late reveal accepted'); } catch (e) { console.log(`late reveal refused: ${e.detail || e.message}`); }
  fin = await chain.settle(game);
  show('settle', fin);
}

const g = fin.game;
const expected = judge({ active: g.active, moves: Object.fromEntries(Object.entries(g.moves).map(([k, m]) => [k, m])) });
const loser = players[g.loser];
console.log(`\n${loser.name} pays. Total ${g.total}, ${['nobody opened', 'furthest guess'][g.reason]}${g.drawn ? ', decided by lot' : ''}.`);
console.log(`judge() agrees: ${expected.pool.includes(g.loser) && expected.total === g.total ? 'yes' : 'NO'}`);
record({ kind: cmd === 'silent' ? 'round-silent' : 'round', players: n, game: hex(game), create_tx: c.hash, seal_txs: [s1.hash, s2.hash], open_txs: [r1.hash, fin.hash],
  settle_tx: cmd === 'silent' ? fin.hash : null, loser: g.loser, total: g.total, reason: g.reason, drawn: g.drawn,
  instructions: { create: c.instructions, seal_one: s1.instructions, seal_rest: s2.instructions, open_one: r1.instructions, open_rest: fin.instructions } });
