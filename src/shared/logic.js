// Shared by the Worker and the web app: how a table's bill is split.
// Amounts are integer cents in the bill's currency.

export const NETWORKS = {
  testnet: {
    horizon: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    explorer: 'https://stellar.expert/explorer/testnet',
    assets: { EURC: 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO', USDC: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' },
  },
  public: {
    horizon: 'https://horizon.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
    explorer: 'https://stellar.expert/explorer/public',
    assets: { EURC: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2', USDC: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
  },
};

export const SWATCHES = ['#FF8AC2', '#FFE45C', '#A6F06A', '#FFAA5C', '#C3A6FF', '#7FD3FF', '#FF7A6B', '#5FE3D4', '#E6B3FF', '#B8E986'];

export function splitCents(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!sum || !total) return weights.map(() => 0);
  const raw = weights.map(w => total * w / sum), fl = raw.map(Math.floor);
  const rem = total - fl.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - fl[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; k < rem; k++) fl[order[k % order.length][1]]++;
  return fl;
}

export const lines = s => (s.receipt && s.receipt.lines) || [];
export const unitsClaimed = (s, lid) => Object.values((s.claims || {})[lid] || {}).reduce((a, b) => a + b, 0);

// What each person owes for one receipt line, and what nobody has claimed yet.
export function lineAlloc(s, l) {
  const c = (s.claims || {})[l.id] || {}, ids = s.order.filter(id => c[id] > 0), out = {};
  let left = 0;
  if (l.kind === 'each') {
    const slices = splitCents(l.total, Array(Math.max(1, l.qty)).fill(1));
    let k = 0;
    ids.forEach(id => { let v = 0; for (let u = 0; u < c[id] && k < slices.length; u++) v += slices[k++]; out[id] = v; });
    for (; k < slices.length; k++) left += slices[k];
  } else if (!ids.length) left = l.total;
  else splitCents(l.total, ids.map(() => 1)).forEach((v, i) => { out[ids[i]] = v; });
  return { out, left };
}

export function receiptTotal(s) { return lines(s).reduce((a, l) => a + l.total, 0); }

export function shares(s) {
  const items = {}, leftShare = {}, tip = {}, total = {};
  s.order.forEach(id => { items[id] = 0; leftShare[id] = 0; });
  let left = 0;
  lines(s).forEach(l => { const a = lineAlloc(s, l); for (const id in a.out) items[id] = (items[id] || 0) + a.out[id]; left += a.left; });
  if (s.leftover && left > 0) splitCents(left, s.order.map(() => 1)).forEach((v, i) => { leftShare[s.order[i]] = v; });
  const base = s.order.map(id => items[id] + leftShare[id]);
  const sub = receiptTotal(s);
  const tipTotal = Math.round(sub * (s.tip || 0) / 100);
  const tips = splitCents(tipTotal, base);
  s.order.forEach((id, i) => { tip[id] = tips[i]; total[id] = base[i] + tips[i]; });
  // A settled round of "Who pays?": the loser pays for everyone who stayed in the round.
  const g = s.game, pool = gamePool(s);
  if (pool) { let pot = 0; pool.forEach(id => { pot += total[id]; if (id !== g.outcome.loser) total[id] = 0; }); total[g.outcome.loser] = pot; }
  const owing = s.order.filter(id => id !== s.host && total[id] > 0);
  const owed = owing.reduce((a, id) => a + total[id], 0);
  const back = owing.filter(id => s.paid[id] && s.paid[id].confirmed).reduce((a, id) => a + s.paid[id].cents, 0);
  const all = s.order.reduce((a, id) => a + total[id], 0);
  return { items, leftShare, tip, total, unclaimed: s.leftover ? 0 : left, leftRaw: left, tipTotal, owed, back, all, sub };
}

// Who a settled round covers (the players still in it when it was settled), or null.
export const gamePool = s => (s.game && s.game.status === 'done' && s.game.outcome ? (s.game.active && s.game.active.length ? s.game.active : s.game.players).filter(id => s.order.includes(id)) : null);
// True for someone whose part is paid by the round's loser.
export const gameFree = (s, id) => { const p = gamePool(s); return !!p && p.includes(id) && s.game.outcome.loser !== id; };

// Text memo that identifies who paid, at most 28 bytes: "QUITS BEAT7KQ A4".
export const memoFor = (code, pid) => `QUITS ${code} ${pid}`.slice(0, 28);

// Amount due in an asset, as a Stellar amount string with 2 decimals.
// The bill is in s.currency (EUR or USD); rate is USD per EUR.
export function dueAmount(cents, asset, currency, rate) {
  const v = cents / 100;
  const r = rate || 1.16;
  let x = v;
  if (currency === 'EUR' && asset === 'USDC') x = v * r;
  if (currency === 'USD' && asset === 'EURC') x = v / r;
  return (Math.ceil(x * 100) / 100).toFixed(2);
}

export const isG = a => typeof a === 'string' && /^G[A-Z2-7]{55}$/.test(a);
export const short = a => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
