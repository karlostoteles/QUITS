// Sign in with Google (ID tokens from Google Identity Services) and Quits sessions.
// A session is "<uid>.<expiry>.<hmac>": the Worker can check it without a lookup.

const enc = new TextEncoder();
const b64uDecode = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const b64uEncode = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const part = s => JSON.parse(new TextDecoder().decode(b64uDecode(s)));

let certs = { at: 0, keys: [] };
async function googleKeys(force) {
  if (!force && certs.keys.length && Date.now() - certs.at < 3600_000) return certs.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('Google sign-in is not reachable right now');
  certs = { at: Date.now(), keys: (await r.json()).keys || [] };
  return certs.keys;
}

const fail = msg => { throw Object.assign(new Error(msg), { code: 401 }); };

// Checks a Google ID token and returns who it is.
export async function verifyGoogle(env, credential) {
  const tok = String(credential || '');
  if (env.AUTH_TEST === '1' && tok.startsWith('test:')) {
    const [, sub, name = 'Tester'] = tok.split(':');
    return { uid: 'gtest' + sub.replace(/\W/g, ''), email: `${sub}@test.local`, name, given: name.split(' ')[0], picture: '' };
  }
  if (!env.GOOGLE_CLIENT_ID) fail('Google sign-in is not set up');
  const [h, p, sig] = tok.split('.');
  if (!sig) fail('That sign-in did not work. Try again.');
  let head, claims;
  try { head = part(h); claims = part(p); } catch (e) { fail('That sign-in did not work. Try again.'); }
  if (head.alg !== 'RS256') fail('That sign-in did not work. Try again.');
  let jwk = (await googleKeys()).find(k => k.kid === head.kid) || (await googleKeys(true)).find(k => k.kid === head.kid);
  if (!jwk) fail('That sign-in did not work. Try again.');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uDecode(sig), enc.encode(h + '.' + p));
  if (!ok) fail('That sign-in did not work. Try again.');
  const now = Date.now() / 1000;
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') fail('That sign-in did not work. Try again.');
  if (claims.aud !== env.GOOGLE_CLIENT_ID) fail('That sign-in did not work. Try again.');
  if (!(Number(claims.exp) > now - 120)) fail('The sign-in took too long. Try again.');
  if (!/^\d{1,40}$/.test(String(claims.sub || ''))) fail('That sign-in did not work. Try again.');
  return { uid: 'g' + claims.sub, email: String(claims.email || ''), name: String(claims.name || claims.given_name || ''), given: String(claims.given_name || ''), picture: String(claims.picture || '') };
}

async function hmac(env, data) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64uEncode(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function makeSession(env, uid, days = 120) {
  if (!env.SESSION_SECRET) throw new Error('Sessions are not set up');
  const body = `${uid}.${Math.floor(Date.now() / 1000) + days * 86400}`;
  return `${body}.${await hmac(env, body)}`;
}

export async function readSession(env, token) {
  if (!token || !env.SESSION_SECRET) return null;
  const bits = String(token).split('.');
  if (bits.length !== 3 || !/^g[\w]{1,60}$/.test(bits[0]) || !(Number(bits[1]) > Date.now() / 1000)) return null;
  const good = await hmac(env, `${bits[0]}.${bits[1]}`);
  if (good.length !== bits[2].length) return null;
  let d = 0;
  for (let i = 0; i < good.length; i++) d |= good.charCodeAt(i) ^ bits[2].charCodeAt(i);
  return d === 0 ? bits[0] : null;
}

export function sessionToken(req) {
  const a = req.headers.get('authorization') || '';
  if (/^Bearer\s+/i.test(a)) return a.replace(/^Bearer\s+/i, '').trim();
  return new URL(req.url).searchParams.get('session') || '';
}
