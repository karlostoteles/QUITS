// Checking payments on Stellar through Horizon. Quits only reads the ledger; it never holds funds.
import { NETWORKS } from '../shared/logic.js';

async function hz(net, path) {
  const r = await fetch(NETWORKS[net].horizon + path, { headers: { accept: 'application/json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`horizon ${r.status}`);
  return r.json();
}

const okAsset = (net, rec, asset) => rec.asset_code === asset && rec.asset_issuer === NETWORKS[net].assets[asset];
const PAY_TYPES = new Set(['payment', 'path_payment_strict_receive', 'path_payment_strict_send']);

// A transaction the guest's wallet just submitted: does it pay `to` at least `min` of `asset` with this memo?
export async function verifyTx(net, hash, { to, memo, asset, min }) {
  if (!/^[0-9a-f]{64}$/.test(hash || '')) return { ok: false, why: 'bad hash' };
  const tx = await hz(net, `/transactions/${hash}`);
  if (!tx) return { ok: false, why: 'not found yet' };
  if (!tx.successful) return { ok: false, why: 'failed on chain' };
  const ops = await hz(net, `/transactions/${hash}/payments?limit=50`);
  const recs = (ops && ops._embedded && ops._embedded.records) || [];
  const hit = recs.find(p => PAY_TYPES.has(p.type) && p.to === to && okAsset(net, p, asset) && Number(p.amount) >= Number(min) * 0.98);
  if (!hit) return { ok: false, why: 'no matching payment in this transaction' };
  const memoOk = !memo || (tx.memo_type === 'text' && tx.memo === memo);
  return { ok: true, memoOk, amount: hit.amount, ledger: tx.ledger, hash, from: hit.from, at: tx.created_at };
}

// Payments sent by hand from any wallet or exchange: look for one with our memo.
export async function findPayment(net, to, { memo, asset, min, since }) {
  const page = await hz(net, `/accounts/${to}/payments?order=desc&limit=60&join=transactions`);
  const recs = (page && page._embedded && page._embedded.records) || [];
  for (const p of recs) {
    if (!PAY_TYPES.has(p.type) || p.to !== to || !okAsset(net, p, asset)) continue;
    const tx = p.transaction || {};
    if (!tx.successful || tx.memo_type !== 'text' || tx.memo !== memo) continue;
    if (since && Date.parse(p.created_at) < since - 120000) continue;
    if (Number(p.amount) < Number(min) * 0.98) continue;
    return { amount: p.amount, ledger: tx.ledger, hash: p.transaction_hash, from: p.from, at: p.created_at };
  }
  return null;
}

// Can this account receive the asset? (it needs a trustline)
export async function canReceive(net, account) {
  const a = await hz(net, `/accounts/${account}`);
  if (!a) return { exists: false, assets: [] };
  const assets = Object.keys(NETWORKS[net].assets).filter(code => (a.balances || []).some(b => b.asset_code === code && b.asset_issuer === NETWORKS[net].assets[code]));
  return { exists: true, assets };
}

// USD per EUR from the EURC/USDC order book on the public network (a quote, not a trade).
export async function eurUsd() {
  try {
    const A = NETWORKS.public.assets;
    const ob = await hz('public', `/order_book?selling_asset_type=credit_alphanum4&selling_asset_code=EURC&selling_asset_issuer=${A.EURC}&buying_asset_type=credit_alphanum4&buying_asset_code=USDC&buying_asset_issuer=${A.USDC}&limit=1`);
    const bid = ob && ob.bids && ob.bids[0] && Number(ob.bids[0].price);
    const ask = ob && ob.asks && ob.asks[0] && Number(ob.asks[0].price);
    const mid = bid && ask ? (bid + ask) / 2 : (bid || ask);
    if (mid && mid > 0.8 && mid < 1.6) return Math.round(mid * 10000) / 10000;
  } catch (e) { /* fall through */ }
  return 1.16;
}
