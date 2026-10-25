// One Durable Object per table: the live state of a night out, its photos, and who may change what.
import { DurableObject } from 'cloudflare:workers';
import { shares, unitsClaimed, lines, memoFor, dueAmount, SWATCHES } from '../shared/logic.js';
import { json, err, rid, sha, parseDataUrl, validAccount, clean } from './util.js';
import { readReceipt } from './ai.js';
import { verifyTx, findPayment, canReceive, eurUsd } from './stellar.js';
import * as G from './game.js';

const OPEN = ['open', 'scanning', 'claiming'];
const TIPS = [0, 5, 10, 15];
const KINDS = new Set(['each', 'dish', 'shared']);

export class TableDO extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec('CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT, data BLOB, by TEXT, at INTEGER)');
      this.s = (await ctx.storage.get('state')) || null;
      this.tok = (await ctx.storage.get('tokens')) || {};
      this.members = (await ctx.storage.get('members')) || {}; // account uid -> pid (set only by the Worker, never by browsers)
    });
  }

  // What someone who is not at the table may see (a shared night): no contact handles.
  pub() {
    const people = {};
    for (const [k, p] of Object.entries(this.s.people)) people[k] = { ...p, contact: '' };
    return { ...this.s, people };
  }

  async commit() {
    // A counter so phones can tell a fresh state from a late reply that crossed a newer broadcast.
    this.s.rev = (this.s.rev || 0) + 1;
    await this.ctx.storage.put('state', this.s);
    const full = JSON.stringify({ t: 'state', s: this.s }), open = JSON.stringify({ t: 'state', s: this.pub() });
    for (const ws of this.ctx.getWebSockets()) {
      let member = false;
      try { member = !!(ws.deserializeAttachment() || {}).pid; } catch (e) { /* no attachment */ }
      try { ws.send(member ? full : open); } catch (e) { /* closed */ }
    }
  }

  async check(pid, token) {
    if (!pid || !token || !this.tok[pid]) return null;
    return (await sha(token)) === this.tok[pid] ? pid : null;
  }
  // A person at the table: their per-table token on this phone, or their signed-in account.
  async who(req) {
    const byToken = await this.check(req.headers.get('x-quits-pid'), req.headers.get('x-quits-token'));
    if (byToken) return byToken;
    const uid = req.headers.get('x-quits-uid');
    return uid && this.members[uid] && this.s && this.s.people[this.members[uid]] ? this.members[uid] : null;
  }
  async linkAccount(uid, pid) {
    if (!uid || !pid || this.members[uid]) return;
    if (Object.values(this.members).includes(pid)) return;
    this.members[uid] = pid;
    await this.ctx.storage.put('members', this.members);
  }

  async newPerson({ name, color, contact }, isHost) {
    const n = this.s ? this.s.order.length + 1 : 1;
    const pid = (isHost ? 'H' : 'P') + n;
    const token = rid();
    this.tok[pid] = await sha(token);
    await this.ctx.storage.put('tokens', this.tok);
    const taken = new Set(this.s ? this.s.order.map(id => this.s.people[id].color) : []);
    const col = SWATCHES.includes(color) && !taken.has(color) ? color : (SWATCHES.find(c => !taken.has(c)) || SWATCHES[n % SWATCHES.length]);
    return { pid, token, person: { name: clean(name, 18) || (isHost ? 'Host' : 'Guest'), color: col, contact: clean(contact, 40), at: Date.now() } };
  }

  putImage(img, by) {
    const id = rid(9);
    this.sql.exec('INSERT INTO images (id, mime, data, by, at) VALUES (?, ?, ?, ?, ?)', id, img.mime, img.bytes, by, Date.now());
    return id;
  }

  async takeAI() {
    const lim = this.env.LIMITER.get(this.env.LIMITER.idFromName('global'));
    return lim.take('ai', Number(this.env.AI_DAILY_MAX || 400));
  }

  async fetch(req) {
    const url = new URL(req.url), path = url.pathname.replace(/^\/do/, '');
    try {
      if (path === '/create' && req.method === 'POST') return this.create(await req.json());
      if (!this.s) return err('No table with this code', 404);
      if (path === '/state') { const me = await this.who(req); return json({ s: me ? this.s : this.pub(), me: me || null }); }
      if (path === '/ws') {
        if (req.headers.get('upgrade') !== 'websocket') return err('Expected a websocket', 426);
        const uid = req.headers.get('x-quits-uid');
        const pid = (await this.check(url.searchParams.get('pid'), url.searchParams.get('token'))) || (uid && this.members[uid]) || null;
        const pair = new WebSocketPair();
        this.ctx.acceptWebSocket(pair[1]);
        pair[1].serializeAttachment({ pid: pid || null });
        pair[1].send(JSON.stringify({ t: 'state', s: pid ? this.s : this.pub() }));
        return new Response(null, { status: 101, webSocket: pair[0] });
      }
      if (path.startsWith('/img/')) {
        const row = [...this.sql.exec('SELECT mime, data FROM images WHERE id = ?', path.slice(5))][0];
        if (!row) return err('No such image', 404);
        return new Response(row.data, { headers: { 'content-type': row.mime, 'cache-control': 'public, max-age=31536000, immutable' } });
      }
      if (path === '/join' && req.method === 'POST') return this.join(await req.json(), req.headers.get('x-quits-uid'));
      if (path === '/link' && req.method === 'POST') {
        // A signed-in person claims a seat they took on this phone before signing in.
        const b = await req.json(), uid = req.headers.get('x-quits-uid');
        const pid = await this.check(b.pid, b.token);
        if (!pid || !uid) return json({ ok: false });
        await this.linkAccount(uid, pid);
        return json({ ok: this.members[uid] === pid, pid, role: pid === this.s.host ? 'host' : 'guest' });
      }
      const pid = await this.who(req);
      if (!pid) return err('Not part of this table', 403);
      const body = req.method === 'POST' ? await req.json() : {};
      if (path === '/receipt') return this.receipt(pid, body);
      if (path === '/photo') return this.photo(pid, body);
      if (path === '/act') return this.act(pid, body);
      return err('Unknown request', 404);
    } catch (e) {
      return err(e.message || 'Something went wrong', 500);
    }
  }

  async create(b) {
    if (this.s) return err('Code taken', 409);
    const address = clean(b.address, 56);
    if (!validAccount(address)) return err('That is not a valid Stellar address (it starts with G and has 56 characters).');
    const cover = b.cover ? parseDataUrl(b.cover) : null;
    const net = b.network === 'public' ? 'public' : 'testnet';
    const accept = (Array.isArray(b.accept) ? b.accept : ['USDC']).filter(a => a === 'EURC' || a === 'USDC');
    let recv = { exists: true, assets: accept };
    try { recv = await canReceive(net, address); } catch (e) { /* Horizon down: let it through */ }
    if (!recv.exists) return err('This address has no account on Stellar yet. Fund it with a few XLM first.');
    const usable = accept.filter(a => recv.assets.includes(a));
    if (!usable.length) return err(`This wallet can't receive ${accept.join(' or ')} yet. Add ${accept[0]} in your wallet app (it's called a trustline) and try again.`);
    const host = await this.newPerson({ name: b.hostName, color: b.color, contact: b.contact }, true);
    this.s = {
      v: 1, code: b.code, network: net, createdAt: Date.now(),
      name: clean(b.name, 40) || 'Tonight', coverId: null, place: clean(b.place, 40),
      host: host.pid, hostAddress: address, accept: usable, currency: 'EUR',
      order: [host.pid], people: { [host.pid]: host.person },
      phase: 'open', receipt: null, tip: 0, claims: {}, ready: [], leftover: false,
      paid: {}, intents: {}, photos: [], t0: Date.now(), tSettled: null, rate: null,
      game: null, settleWanted: false,
    };
    if (cover) this.s.coverId = this.putImage(cover, host.pid);
    if (b.uid) await this.linkAccount(b.uid, host.pid);
    await this.commit();
    return json({ code: b.code, pid: host.pid, token: host.token, s: this.s });
  }

  async join(b, uid) {
    if (uid && this.members[uid] && this.s.people[this.members[uid]]) return json({ pid: this.members[uid], token: '', s: this.s, again: true });
    if (!OPEN.includes(this.s.phase)) return err('This table is already settling up. Ask the host to add you.', 409);
    if (this.s.order.length >= 24) return err('This table is full.', 409);
    const p = await this.newPerson(b, false);
    this.s.order.push(p.pid);
    this.s.people[p.pid] = p.person;
    if (uid) await this.linkAccount(uid, p.pid);
    await this.commit();
    return json({ pid: p.pid, token: p.token, s: this.s });
  }

  async receipt(pid, b) {
    if (pid !== this.s.host) return err('Only the host can scan the receipt', 403);
    if (!['open', 'scanning'].includes(this.s.phase)) return err('The receipt is already on the table', 409);
    const img = parseDataUrl(b.image);
    if (!img) return err('Send the photo as a JPEG or PNG under 3 MB');
    this.s.reads = (this.s.reads || 0) + 1;
    if (this.s.reads > 6) return err('Too many scans for this table. Type the lines by hand.', 429);
    if (!(await this.takeAI())) return err('The receipt reader is busy today. Type the lines by hand.', 429);
    this.s.phase = 'scanning';
    const imageId = this.putImage(img, pid);
    await this.commit();
    const r = await readReceipt(this.env, img.b64, img.mime);
    return json({ ...r, imageId });
  }

  async photo(pid, b) {
    const img = parseDataUrl(b.image);
    if (!img) return err('Send the photo as a JPEG or PNG under 3 MB');
    if (this.s.photos.length >= 60) return err('This night already has 60 photos', 409);
    const id = this.putImage(img, pid);
    this.s.photos.unshift({ id, by: pid, at: Date.now() });
    await this.commit();
    return json({ ok: true, id });
  }

  // ---- everything else people do at the table ----
  async act(pid, b) {
    const s = this.s, host = pid === s.host, t = b.type;
    const need = (cond, msg, code = 409) => { if (!cond) throw Object.assign(new Error(msg), { code }); };
    try {
      if (t === 'scan') { need(host, 'Only the host'); if (s.phase === 'open') s.phase = 'scanning'; }
      else if (t === 'unscan') { need(host, 'Only the host'); if (s.phase === 'scanning') s.phase = 'open'; }
      else if (t === 'publish') {
        need(host, 'Only the host'); need(['open', 'scanning'].includes(s.phase), 'The receipt is already on the table');
        const ls = (b.lines || []).slice(0, 80).map((l, i) => ({
          id: 'l' + (i + 1), qty: Math.min(99, Math.max(1, Math.round(Number(l.qty) || 1))), name: clean(l.name, 48) || 'Item',
          total: Math.max(0, Math.min(10_000_000, Math.round(Number(l.total) || 0))), kind: KINDS.has(l.kind) ? l.kind : 'dish', en: clean(l.en, 60),
        })).filter(l => l.total > 0);
        need(ls.length > 0, 'Add at least one line');
        ls.forEach(l => { if (l.kind === 'each' && l.qty === 1) l.kind = 'dish'; });
        s.receipt = { lines: ls, imageId: clean(b.imageId, 16) || null, printedTotal: Math.round(Number(b.printedTotal) || 0) || null };
        s.currency = b.currency === 'USD' ? 'USD' : 'EUR';
        s.tip = TIPS.includes(Number(b.tip)) ? Number(b.tip) : 0;
        s.claims = {}; s.ready = []; s.leftover = false; s.phase = 'claiming';
        s.rate = { eurUsd: await eurUsd(), at: Date.now() };
      }
      else if (t === 'tip') { need(host, 'Only the host'); need(s.phase === 'claiming', 'Too late to change the tip'); s.tip = TIPS.includes(Number(b.tip)) ? Number(b.tip) : 0; }
      else if (t === 'claim') {
        need(s.phase === 'claiming', 'The receipt is closed');
        const l = lines(s).find(x => x.id === b.lid); need(l, 'No such line', 404);
        const c = s.claims[l.id] || (s.claims[l.id] = {}), cur = c[pid] || 0, d = Math.round(Number(b.delta) || 0);
        if (l.kind === 'each') { need(!(d > 0 && unitsClaimed(s, l.id) >= l.qty), `All ${l.qty} are claimed`); c[pid] = Math.max(0, Math.min(l.qty, cur + d)); }
        else c[pid] = d > 0 ? 1 : 0;
        if (!c[pid]) delete c[pid];
        s.ready = s.ready.filter(x => x !== pid);
      }
      else if (t === 'ready') {
        need(s.phase === 'claiming', 'The receipt is closed');
        s.ready = s.ready.filter(x => x !== pid); if (b.v !== false) s.ready.push(pid);
        this.allReady();
      }
      else if (t === 'close') { need(host, 'Only the host'); need(s.phase === 'claiming', 'Nothing to close'); this.settle(); }
      else if (t === 'cash') {
        need(s.phase === 'settling', 'Payments are not open yet'); need(!host, 'You paid the bill');
        need(!(s.paid[pid] && s.paid[pid].confirmed), 'Already paid');
        s.paid[pid] = { how: 'cash', cents: shares(s).total[pid], confirmed: false, at: Date.now() };
      }
      else if (t === 'uncash') {
        // Marked as cash by mistake: while the host has not confirmed it, the payer can take it back and pay another way.
        const p = s.paid[pid]; need(p && p.how === 'cash', 'Nothing to take back'); need(!p.confirmed, `${s.people[s.host].name} already confirmed your cash`);
        delete s.paid[pid];
      }
      else if (t === 'confirmCash') {
        need(host, 'Only the host'); const p = s.paid[b.who]; need(p && p.how === 'cash', 'Nothing to confirm');
        p.confirmed = true; p.at = Date.now(); this.checkSettled();
      }
      else if (t === 'intent') {
        need(s.phase === 'settling', 'Payments are not open yet'); need(!host, 'You paid the bill');
        need(s.accept.includes(b.asset), 'The host does not take that currency');
        const cents = shares(s).total[pid];
        s.intents[pid] = { asset: b.asset, amount: dueAmount(cents, b.asset, s.currency, s.rate && s.rate.eurUsd), cents, memo: memoFor(s.code, pid), at: Date.now() };
        await this.ctx.storage.setAlarm(Date.now() + 5000);
      }
      else if (t === 'paid') {
        need(s.phase === 'settling', 'Payments are not open yet'); need(!host, 'You paid the bill');
        const it = s.intents[pid]; need(it, 'Start the payment first');
        const v = await verifyTx(s.network, String(b.tx || ''), { to: s.hostAddress, memo: it.memo, asset: it.asset, min: it.amount });
        if (!v.ok) return json({ ok: false, why: v.why });
        if (!v.memoOk) return json({ ok: false, why: 'the payment has a different memo' });
        if (Object.entries(s.paid).some(([k, p]) => k !== pid && p.tx === v.hash)) return json({ ok: false, why: 'that payment is already someone else’s' });
        s.paid[pid] = { how: 'wallet', wallet: clean(b.wallet, 20), asset: it.asset, amount: v.amount, cents: it.cents, tx: v.hash, ledger: v.ledger, confirmed: true, at: Date.now() };
        delete s.intents[pid];
        this.checkSettled();
      }
      else if (t === 'check') { need(s.intents[pid], 'Nothing to check'); await this.detect([pid]); }
      else if (t === 'rename') { need(host, 'Only the host'); s.name = clean(b.name, 40) || s.name; }
      else if (t === 'contact') { s.people[pid].contact = clean(b.contact, 40); }
      // ---- "Who pays?": a round of hidden coins judged on Stellar ----
      else if (t === 'gameAsk') { need(host, 'Only the host'); need(s.phase === 'claiming', 'The round is played before paying back'); const ci = G.chainInfo(this.env); need(ci, 'Rounds are not set up on this server'); G.propose(s, ci); }
      else if (t === 'gameAnswer') { G.answer(s, pid, b.yes !== false, String(b.pk || '')); }
      else if (t === 'gameCancel') { need(host, 'Only the host'); G.cancel(s); this.afterGame(); }
      else if (t === 'gameStart') { need(host, 'Only the host'); await G.start(this, s); }
      else if (t === 'gameSeal') { G.seal(s, pid, String(b.commitment || ''), String(b.sig || '')); await this.wake(1200); }
      else if (t === 'gameOpen') { await G.open(s, pid, b.coins, b.guess, String(b.salt || '')); await this.wake(900); }
      else if (t === 'gameClose') { need(host, 'Only the host'); await G.close(this, s); this.afterGame(); }
      else if (t === 'gameRetry') { need(host, 'Only the host'); need(s.game, 'No round'); s.game.error = null; s.game.tries = 0; await this.wake(100); }
      else return err('Unknown action', 400);
    } catch (e) {
      return err(e.message, e.code || 409);
    }
    await this.commit();
    return json({ ok: true, s });
  }

  allReady() {
    const s = this.s;
    if (s.phase !== 'claiming' || !s.order.every(id => s.ready.includes(id))) return;
    // Everyone is done. A round in progress decides who pays; if one could still be played, the host decides
    // between a round and closing the receipt; otherwise the receipt closes itself.
    if (G.gameActive(s.game)) { s.settleWanted = true; return; }
    if (this.roundOffered()) return;
    this.settle();
  }
  // A round can still be proposed: rounds are set up, there are at least two people, and this table has not played one.
  roundOffered() {
    const s = this.s;
    return !!G.chainInfo(this.env) && s.order.length >= 2 && !(s.game && s.game.status === 'done');
  }
  settle() {
    const s = this.s;
    // A round in progress decides who pays: the receipt closes once it is over.
    if (G.gameActive(s.game)) { s.settleWanted = true; return; }
    s.settleWanted = false;
    if (shares(s).leftRaw > 0) s.leftover = true;
    s.phase = 'settling';
    this.checkSettled();
  }
  afterGame() {
    const s = this.s;
    if (G.gameActive(s.game) || s.phase !== 'claiming') return;
    const everyone = s.order.every(id => s.ready.includes(id));
    // A finished round closes the receipt if the host asked for it or everyone was done; a cancelled one leaves the host to decide.
    if (s.game.status === 'done' ? s.settleWanted || everyone : s.settleWanted) this.settle();
  }
  checkSettled() {
    const s = this.s;
    if (s.phase !== 'settling') return;
    const sh = shares(s);
    const owing = s.order.filter(id => id !== s.host && sh.total[id] > 0);
    if (owing.every(id => s.paid[id] && s.paid[id].confirmed)) { s.phase = 'settled'; s.tSettled = Date.now(); }
  }
  // Runs the alarm within ms, unless it is already due sooner.
  async wake(ms) {
    const at = Date.now() + ms, cur = await this.ctx.storage.getAlarm();
    if (!cur || cur > at) await this.ctx.storage.setAlarm(at);
  }

  // Look on Stellar for payments sent by hand with our memo.
  async detect(ids) {
    const s = this.s;
    let found = false;
    for (const pid of ids) {
      const it = s.intents[pid];
      if (!it || (s.paid[pid] && s.paid[pid].confirmed)) continue;
      const hit = await findPayment(s.network, s.hostAddress, { memo: it.memo, asset: it.asset, min: it.amount, since: it.at });
      if (hit) {
        s.paid[pid] = { how: 'wallet', wallet: 'a Stellar wallet', asset: it.asset, amount: hit.amount, cents: it.cents, tx: hit.hash, ledger: hit.ledger, confirmed: true, at: Date.now() };
        delete s.intents[pid];
        found = true;
      }
    }
    if (found) this.checkSettled();
    return found;
  }

  async alarm() {
    if (!this.s) return;
    let next = null;
    if (G.gameActive(this.s.game)) {
      let r = { changed: false, next: 8000 };
      try { r = await G.relay(this); } catch (e) { this.s.game.error = String(e.message || e).slice(0, 200); r = { changed: true, next: 6000 }; }
      if (r.changed) { this.afterGame(); await this.commit(); }
      if (G.gameActive(this.s.game) && this.s.game.status !== 'invite') next = r.next || (this.s.game.pending.seal.length || this.s.game.pending.open.length ? 1500 : null);
    }
    if (this.s.phase === 'settling') {
      const open = Object.keys(this.s.intents).filter(pid => Date.now() - this.s.intents[pid].at < 45 * 60 * 1000);
      if (open.length) {
        try { if (await this.detect(open)) await this.commit(); } catch (e) { /* Horizon hiccup: try again */ }
        if (Object.keys(this.s.intents).length) next = Math.min(next || 6000, 6000);
      }
    }
    if (next) await this.ctx.storage.setAlarm(Date.now() + next);
  }

  webSocketMessage(ws, msg) { if (msg === 'ping') ws.send('pong'); }
  webSocketClose(ws, code) { try { ws.close(code, 'bye'); } catch (e) { /* already closed */ } }
}
