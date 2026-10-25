import { DurableObject } from 'cloudflare:workers';
import { TableDO } from './table.js';
import { UserDO } from './user.js';
import { ChainDO } from './chaindo.js';
import { chainInfo } from './game.js';
import { json, err, parseDataUrl, makeCode } from './util.js';
import { readSign } from './ai.js';
import { eurUsd } from './stellar.js';
import { verifyGoogle, makeSession, readSession, sessionToken } from './auth.js';

export { TableDO, UserDO, ChainDO };

// Daily counters (AI calls overall, sign reads per visitor) so a busy day can't drain the API credits.
export class LimiterDO extends DurableObject {
  async take(kind, max) {
    const key = kind + ':' + new Date().toISOString().slice(0, 10);
    const n = (await this.ctx.storage.get(key)) || 0;
    if (n >= max) return false;
    await this.ctx.storage.put(key, n + 1);
    return true;
  }
  async peek(kind) {
    return (await this.ctx.storage.get(kind + ':' + new Date().toISOString().slice(0, 10))) || 0;
  }
}

const limiter = (env, name) => env.LIMITER.get(env.LIMITER.idFromName(name));
const table = (env, code) => env.TABLE.get(env.TABLE.idFromName(code));
const account = (env, uid) => env.USER.get(env.USER.idFromName(uid));
const ipOf = req => req.headers.get('cf-connecting-ip') || 'local';

// Accounts (Sign in with Google) are on when a Google client ID is configured.
const accountsOn = env => !!(env.GOOGLE_CLIENT_ID || env.AUTH_TEST === '1');

// Opening tables is invite-only when INVITE_CODES is set (comma-separated). Joining a table never needs a code.
const invites = env => String(env.INVITE_CODES || '').split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
const invited = (env, code) => { const l = invites(env); return !l.length || l.includes(String(code || '').trim().toUpperCase()); };
const needInvite = () => json({ error: 'Opening a table needs an invite code.', need: 'invite' }, 403);
const needLogin = () => json({ error: 'Sign in to continue.', need: 'login' }, 401);
const view = (env, u) => u && ({ uid: u.uid, email: u.email, name: u.name, picture: u.picture, invited: !!u.invited || !invites(env).length, profile: u.profile, nights: u.nights });

// Can this request open a table (and use the sign reader)? Returns { uid } or a response to send back.
async function mayOpen(env, req) {
  if (accountsOn(env)) {
    const uid = await readSession(env, sessionToken(req));
    if (!uid) return { res: needLogin() };
    const u = await account(env, uid).get();
    if (!u) return { res: needLogin() };
    if (invites(env).length && !u.invited) return { res: needInvite() };
    return { uid };
  }
  return invited(env, req.headers.get('x-quits-invite')) ? { uid: null } : { res: needInvite() };
}

async function inviteTry(env, req, code) {
  const lim = limiter(env, 'ip:' + ipOf(req));
  if ((await lim.peek('invite-miss')) >= 20) return { limited: true };
  if (invited(env, code)) return { ok: true };
  await lim.take('invite-miss', 1e9);
  return { ok: false };
}

// Links to a table or a night get a preview with the night's name and cover photo (WhatsApp, Telegram, X).
async function pageWithPreview(req, env, kind, code) {
  const url = new URL(req.url);
  const page = await env.ASSETS.fetch(new Request(new URL('/', url), { headers: req.headers }));
  let s = null;
  try { const r = await table(env, code).fetch('https://table/do/state'); if (r.ok) s = (await r.json()).s; } catch (e) { /* no preview */ }
  if (!s || !page.ok) return page;
  const host = (s.people[s.host] || {}).name || 'A friend';
  const title = kind === 'n' ? `${s.name}, a night on Quits` : `Join ${host}’s table at ${s.name}`;
  const desc = kind === 'n'
    ? `${s.order.length} at the table${s.phase === 'settled' ? ', everyone paid back on Stellar' : ''}.`
    : `Tap what you had and pay ${host} back from your Stellar wallet. No app needed.`;
  const img = s.coverId ? `${url.origin}/api/t/${code}/img/${s.coverId}` : `${url.origin}/og.png`;
  const content = v => ({ element(e) { e.setAttribute('content', v); } });
  const res = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(`${title} · Quits`); } })
    .on('meta[name="description"]', content(desc))
    .on('meta[property="og:title"]', content(title))
    .on('meta[property="og:description"]', content(desc))
    .on('meta[property="og:image"]', content(img))
    .transform(page);
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-cache');
  return out;
}

// What browsers may ask a table for. (create and link are only for the Worker itself.)
const TABLE_PATHS = /^\/(state|ws|join|receipt|photo|act|img\/[\w-]{4,40})$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    const pg = /^\/(t|n)\/([A-Za-z0-9]{4,10})\/?$/.exec(p);
    if (pg && req.method === 'GET') return pageWithPreview(req, env, pg[1], pg[2].toUpperCase());
    if (!p.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      if (p === '/api/health') {
        return json({ ok: true, network: env.NETWORK || 'testnet', wc: env.WC_PROJECT_ID || '', invite: invites(env).length > 0, accounts: accountsOn(env), google: env.GOOGLE_CLIENT_ID || '', authTest: env.AUTH_TEST === '1', game: chainInfo(env) });
      }
      if (p === '/api/rate') return json({ eurUsd: await eurUsd() }, 200, { 'cache-control': 'public, max-age=300' });

      // ---- accounts ----
      if (p === '/api/auth/google' && req.method === 'POST') {
        if (!accountsOn(env)) return err('Sign-in is not set up', 404);
        if (!(await limiter(env, 'ip:' + ipOf(req)).take('login', 200))) return err('Too many sign-ins from here today.', 429);
        const { credential } = await req.json();
        let g;
        try { g = await verifyGoogle(env, credential); } catch (e) { return json({ error: e.message, need: 'login' }, 401); }
        const u = await account(env, g.uid).upsert(g);
        return json({ session: await makeSession(env, g.uid), user: view(env, u) });
      }
      if (p.startsWith('/api/me')) {
        const uid = await readSession(env, sessionToken(req));
        if (!uid) return needLogin();
        const acc = account(env, uid);
        if (p === '/api/me' && req.method === 'GET') { const u = await acc.get(); return u ? json({ user: view(env, u) }) : needLogin(); }
        if (p === '/api/me' && req.method === 'POST') { const u = await acc.setProfile(await req.json()); return u ? json({ user: view(env, u) }) : needLogin(); }
        if (p === '/api/me/invite' && req.method === 'POST') {
          const { code } = await req.json();
          const t = await inviteTry(env, req, code);
          if (t.limited) return err('Too many tries today. Try again tomorrow.', 429);
          if (!t.ok) return json({ ok: false });
          return json({ ok: true, user: view(env, await acc.setInvited(String(code).trim().toUpperCase())) });
        }
        if (p === '/api/me/link' && req.method === 'POST') {
          // Seats taken on this phone before signing in move to the account.
          const { tables = [] } = await req.json();
          for (const t of tables.slice(0, 40)) {
            if (!/^[A-Z0-9]{4,10}$/.test(t.code || '')) continue;
            const r = await table(env, t.code).fetch('https://table/do/link', { method: 'POST', headers: { 'x-quits-uid': uid }, body: JSON.stringify({ pid: t.pid, token: t.token }) });
            const j = r.ok ? await r.json() : {};
            if (j.ok) await acc.addNight({ code: t.code, role: j.role, pid: j.pid });
          }
          const u = await acc.get();
          return u ? json({ user: view(env, u) }) : needLogin();
        }
        if (p === '/api/me/delete' && req.method === 'POST') { await acc.wipe(); return json({ ok: true }); }
        return err('Not found', 404);
      }

      // ---- opening tables ----
      if (p === '/api/invite' && req.method === 'POST') {
        const { code } = await req.json();
        const t = await inviteTry(env, req, code);
        return t.limited ? err('Too many tries today. Try again tomorrow.', 429) : json({ ok: t.ok });
      }

      if (p === '/api/sign' && req.method === 'POST') {
        const { image } = await req.json();
        const img = parseDataUrl(image, 1_500_000);
        if (!img) return err('Send a JPEG or PNG under 1.5 MB');
        if (!(await limiter(env, 'ip:' + ipOf(req)).take('sign', 100))) return json({ name: '' });
        const ok = await mayOpen(env, req);
        if (ok.res) return ok.res;
        if (!(await limiter(env, 'global').take('ai', Number(env.AI_DAILY_MAX || 400)))) return json({ name: '' });
        return json(await readSign(env, img.b64, img.mime));
      }

      if (p === '/api/tables' && req.method === 'POST') {
        const body = await req.json();
        if (!(await limiter(env, 'ip:' + ipOf(req)).take('tables', 100))) return err('Too many new tables today from here. Try again tomorrow.', 429);
        const ok = await mayOpen(env, req);
        if (ok.res) return ok.res;
        for (let i = 0; i < 6; i++) {
          const code = makeCode(body.name);
          const r = await table(env, code).fetch('https://table/do/create', { method: 'POST', body: JSON.stringify({ ...body, uid: ok.uid || null, code, network: env.NETWORK || 'testnet' }) });
          if (r.status === 409) continue;
          if (r.ok && ok.uid) { const j = await r.clone().json(); await account(env, ok.uid).addNight({ code, role: 'host', pid: j.pid }); }
          return r;
        }
        return err('Try again in a moment', 503);
      }

      // ---- everything at a table ----
      const m = /^\/api\/t\/([A-Z0-9]{4,10})(\/.*)?$/.exec(p);
      if (m) {
        const sub = m[2] || '/state';
        if (!TABLE_PATHS.test(sub)) return err('Not found', 404);
        const uid = accountsOn(env) ? await readSession(env, sessionToken(req)) : null;
        const u = new URL(req.url);
        u.pathname = '/do' + sub;
        u.searchParams.delete('session');
        const headers = new Headers(req.headers);
        headers.delete('x-quits-uid');
        headers.delete('authorization');
        if (uid) headers.set('x-quits-uid', uid);
        const r = await table(env, m[1]).fetch(new Request(u, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body }));
        if (uid && sub === '/join' && r.ok) {
          const j = await r.clone().json();
          if (!j.again) await account(env, uid).addNight({ code: m[1], role: 'guest', pid: j.pid });
        }
        return r;
      }
      return err('Not found', 404);
    } catch (e) {
      return err(e.message || 'Something went wrong', e.code === 401 ? 401 : 500);
    }
  },
};
