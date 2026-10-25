// "Who pays?": a round of hidden coins on a Quits table, judged by the whopays contract on Stellar.
// This file keeps the round's state inside the table (s.game) and relays the players' sealed and
// opened moves to the chain. Moves are signed in the browser; the Worker only checks and relays.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { commitmentOf, sealMessage, hex, unhex, randomBytes, MAX_COINS } from '../shared/game.js';

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

const COMMIT_LEDGERS = 120; // ~10 min before anyone may close the sealing phase on chain
const REVEAL_LEDGERS = 36; // ~3 min to open a sealed move
const LEDGER_MS = 5200;
export const ACTIVE = ['invite', 'sealing', 'opening'];
export const gameActive = g => !!g && ACTIVE.includes(g.status);
const isHex = (s, n) => typeof s === 'string' && s.length === n * 2 && /^[0-9a-f]+$/.test(s);
const fail = (msg, code = 409) => { throw Object.assign(new Error(msg), { code }); };

export function propose(s, chainInfo) {
  if (gameActive(s.game)) fail('A round is already on');
  s.game = {
    status: 'invite', id: hex(randomBytes(32)), network: chainInfo.network, contract: chainInfo.contract, explorer: chainInfo.explorer,
    maxCoins: MAX_COINS, invited: [...s.order], answers: {}, keys: {}, players: [], active: [], sealed: {}, opened: {},
    revealUntil: 0, outcome: null, txs: { create: null, seal: [], open: [], close: null, settle: null }, pending: { seal: [], open: [] },
    error: null, tries: 0, at: Date.now(), startedAt: null, doneAt: null,
  };
}

export function answer(s, pid, yes, pk) {
  const g = s.game;
  if (!g || g.status !== 'invite') fail('Nobody is asking right now');
  if (!g.invited.includes(pid)) g.invited.push(pid);
  if (yes) {
    if (!isHex(pk, 32)) fail('Your phone did not make a key for the round. Reload and try again.');
    if (Object.entries(g.keys).some(([id, k]) => id !== pid && k === pk)) fail('That key is already in the round');
    g.keys[pid] = pk;
  } else delete g.keys[pid];
  g.answers[pid] = !!yes;
}

export function cancel(s) {
  const g = s.game;
  if (!g || g.status !== 'invite') fail('Too late to call it off: moves are already sealed on Stellar');
  g.status = 'cancelled'; g.doneAt = Date.now();
}

// The host starts the round with everyone who said yes. Creates it on chain (a few seconds).
export async function start(self, s) {
  const g = s.game;
  if (!g || g.status !== 'invite') fail('Nothing to start');
  const players = s.order.filter(id => g.answers[id] && g.keys[id]);
  if (players.length < 2) fail('You need at least two people in the round');
  g.players = players; g.active = [...players];
  const r = await chain(self).create(g.id, players.map(id => g.keys[id]), g.maxCoins, COMMIT_LEDGERS, REVEAL_LEDGERS);
  if (!r.ok) { g.error = r.error; fail(`Stellar did not take the round: ${r.error}`); }
  g.error = null; g.status = 'sealing'; g.startedAt = Date.now();
  g.txs.create = { tx: r.hash, ledger: r.ledger };
}

// A player seals a move: the commitment hash, signed by the key in their browser.
export function seal(s, pid, commitment, sig) {
  const g = s.game;
  if (!g || g.status !== 'sealing') fail('Moves are not being sealed right now');
  if (!g.players.includes(pid)) fail('You are not in this round', 403);
  if (g.sealed[pid]) fail('Your move is already sealed');
  if (!isHex(commitment, 32) || !isHex(sig, 64)) fail('That move is malformed');
  if (!ed.verify(unhex(sig), sealMessage(unhex(g.id), unhex(commitment)), unhex(g.keys[pid]))) fail('That move is not signed by your key', 403);
  g.sealed[pid] = { commitment, sig, at: Date.now(), tx: null };
  g.pending.seal.push(pid);
}

// A player opens a sealed move; it has to hash to what they sealed.
export async function open(s, pid, coins, guess, salt) {
  const g = s.game;
  if (!g || g.status !== 'opening') fail(g && g.status === 'sealing' ? 'Not everyone has sealed yet' : 'Moves are not being opened right now');
  if (!g.active.includes(pid)) fail('You are not in this round', 403);
  if (g.opened[pid]) fail('Your move is already open');
  coins = Number(coins); guess = Number(guess);
  if (!Number.isInteger(coins) || !Number.isInteger(guess) || coins < 0 || coins > g.maxCoins || guess < 0 || guess > g.maxCoins * g.players.length || !isHex(salt, 32)) fail('That move is malformed');
  const c = hex(await commitmentOf(unhex(g.id), unhex(g.keys[pid]), coins, guess, unhex(salt)));
  if (c !== g.sealed[pid].commitment) fail('That is not the move you sealed', 403);
  g.opened[pid] = { coins, guess, salt, at: Date.now(), tx: null };
  g.pending.open.push(pid);
}

// Mirrors the contract's view of the round into s.game.
export function applyChain(g, cg) {
  if (!cg) return;
  if (cg.phase === 1 && g.status !== 'opening') { g.status = 'opening'; g.revealUntil = cg.revealUntil; g.active = cg.active.map(i => g.players[i]); }
  if (cg.phase === 1) g.revealUntil = cg.revealUntil;
  if (cg.phase === 2 && g.status !== 'done' && g.status !== 'cancelled') {
    g.doneAt = Date.now();
    if (cg.settled) { g.status = 'done'; g.outcome = { loser: g.players[cg.loser], total: cg.total, reason: cg.reason === 1 ? 'furthest' : 'noreveal', drawn: !!cg.drawn, ledger: cg.settledAt }; }
    else g.status = 'cancelled';
  }
}

// Sends whatever is waiting to Stellar. Returns { changed, next } (next: ms until the alarm should run again).
export async function relay(self) {
  const s = self.s, g = s && s.game;
  if (!gameActive(g) || g.status === 'invite') return { changed: false, next: null };
  const c = chain(self);
  let changed = false, next = null;
  const failed = (r, pids, kind) => { g.pending[kind].unshift(...pids); g.tries++; g.error = r.error; next = Math.min(20000, 3000 * g.tries); };
  if (g.status === 'sealing' && g.pending.seal.length) {
    const pids = g.pending.seal.splice(0);
    const r = await c.commitMany(g.id, pids.map(pid => ({ player: g.keys[pid], commitment: g.sealed[pid].commitment, sig: g.sealed[pid].sig })));
    if (r.ok) { g.error = null; g.tries = 0; g.txs.seal.push({ tx: r.hash, ledger: r.ledger, pids }); pids.forEach(pid => { g.sealed[pid].tx = r.hash; }); applyChain(g, r.game); }
    else failed(r, pids, 'seal');
    changed = true;
  }
  if (g.status === 'opening' && g.pending.open.length) {
    const pids = g.pending.open.splice(0);
    const r = await c.revealMany(g.id, pids.map(pid => ({ player: g.keys[pid], coins: g.opened[pid].coins, guess: g.opened[pid].guess, salt: g.opened[pid].salt })));
    if (r.ok) { g.error = null; g.tries = 0; g.txs.open.push({ tx: r.hash, ledger: r.ledger, pids }); pids.forEach(pid => { g.opened[pid].tx = r.hash; }); if (r.game && r.game.settled) g.txs.settle = { tx: r.hash, ledger: r.ledger }; applyChain(g, r.game); }
    else failed(r, pids, 'open');
    changed = true;
  }
  if (g.status === 'opening' && !g.pending.open.length) {
    const silent = g.active.filter(id => !g.opened[id]);
    if (silent.length) {
      // Someone is not opening. Once the window has passed, settle: silence loses.
      let ledger = 0;
      try { ledger = await c.ledger(); } catch (e) { /* retry later */ }
      if (ledger > g.revealUntil) {
        const r = await c.settle(g.id);
        if (r.ok) { g.error = null; g.txs.settle = { tx: r.hash, ledger: r.ledger }; applyChain(g, r.game); }
        else if (r.code === 11) next = 4000; // NotYet: the node that simulated was a ledger behind
        else { g.tries++; g.error = r.error; next = Math.min(20000, 3000 * g.tries); }
        changed = true;
      } else next = Math.max(2500, (g.revealUntil - ledger + 1) * LEDGER_MS);
    }
  }
  return { changed, next };
}

// The host ends the sealing phase without the players who have not sealed (or the whole round if fewer than two did).
export async function close(self, s) {
  const g = s.game;
  if (!g || g.status !== 'sealing') fail('Nothing to close');
  if (g.pending.seal.length) { await relay(self); if (g.status !== 'sealing') return; }
  const r = await chain(self).close(g.id);
  if (!r.ok) { g.error = r.error; fail(`Stellar did not close the round: ${r.error}`); }
  g.txs.close = { tx: r.hash, ledger: r.ledger };
  applyChain(g, r.game);
}

const chain = self => self.env.CHAIN.get(self.env.CHAIN.idFromName('chain'));
export const chainInfo = env => (env.GAME_SECRET && env.GAME_CONTRACT ? { network: env.GAME_NETWORK || 'testnet', contract: env.GAME_CONTRACT, explorer: (env.GAME_NETWORK || 'testnet') === 'public' ? 'https://stellar.expert/explorer/public' : 'https://stellar.expert/explorer/testnet' } : null);
