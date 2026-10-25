// Shared by the browser, the Worker and the scripts: the bytes the whopays contract hashes and
// the message a player signs. Mirrors contracts/whopays/src/lib.rs.

export const COMMIT_TAG = 'QUITS/c';
export const SIGN_TAG = 'QUITS/commit';
export const DRAW_TAG = 'QUITS/draw';
export const MAX_COINS = 3;

const enc = new TextEncoder();
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let k = 0;
  for (const p of parts) { out.set(p, k); k += p.length; }
  return out;
};
export const hex = b => [...b].map(x => x.toString(16).padStart(2, '0')).join('');
export const unhex = h => Uint8Array.from((h.match(/../g) || []).map(x => parseInt(x, 16)));
export const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
export const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));

// SHA-256("QUITS/c" || game || player || coins || guess || salt), with coins and guess as one byte each.
export const commitmentOf = (game, player, coins, guess, salt) =>
  sha256(concat(enc.encode(COMMIT_TAG), game, player, Uint8Array.of(coins & 255, guess & 255), salt));

// What the player's key signs when sealing a move: "QUITS/commit" || game || commitment.
export const sealMessage = (game, commitment) => concat(enc.encode(SIGN_TAG), game, commitment);

// The draw seed the contract uses for ties, from the revealed salts in player order.
export const drawSeed = (game, salts) => sha256(concat(enc.encode(DRAW_TAG), game, ...salts));

// How the contract settles a round, in plain JavaScript (for the UI and the tests).
export function judge({ active, moves, game, salts }) {
  const silent = active.filter(i => !moves[i]);
  let total = 0;
  for (const i of active) if (moves[i]) total += moves[i].coins;
  let pool, reason;
  if (silent.length) { pool = silent; reason = 'noreveal'; }
  else {
    let worst = -1; pool = [];
    for (const i of active) {
      const d = Math.abs(moves[i].guess - total);
      if (d > worst) { worst = d; pool = [i]; } else if (d === worst) pool.push(i);
    }
    reason = 'furthest';
  }
  return { pool, total, reason, drawn: pool.length > 1 };
}

export const PHASES = ['commit', 'reveal', 'done'];
export const REASONS = ['noreveal', 'furthest'];
