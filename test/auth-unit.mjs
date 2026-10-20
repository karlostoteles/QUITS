// Checks the Google ID-token verification with a key we make ourselves (fetch to Google's certs is faked).
import { verifyGoogle, makeSession, readSession } from '../src/worker/auth.js';
const { subtle } = globalThis.crypto;
const b64u = buf => Buffer.from(buf).toString('base64url');
const kp = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
globalThis.fetch = async url => ({ ok: true, json: async () => ({ keys: [jwk] }) });
const env = { GOOGLE_CLIENT_ID: 'cid.apps.googleusercontent.com', SESSION_SECRET: 'x'.repeat(40) };
async function jwt(claims, { kid = 'k1', key = kp.privateKey } = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })), p = b64u(JSON.stringify(claims));
  const sig = await subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(h + '.' + p));
  return `${h}.${p}.${b64u(sig)}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: '1234567890', email: 'a@b.c', name: 'Ana B', given_name: 'Ana', exp: now + 600, iat: now };
const tryIt = async (label, tok, expectOk) => { try { const r = await verifyGoogle(env, tok); console.log(expectOk ? 'ok  ' : 'BAD ', label, '->', r.uid, r.name); } catch (e) { console.log(expectOk ? 'BAD ' : 'ok  ', label, '-> rejected:', e.message); } };
await tryIt('valid token', await jwt(good), true);
await tryIt('wrong audience', await jwt({ ...good, aud: 'other' }), false);
await tryIt('expired', await jwt({ ...good, exp: now - 3600 }), false);
await tryIt('wrong issuer', await jwt({ ...good, iss: 'evil.com' }), false);
const other = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
await tryIt('signed by another key', await jwt(good, { key: other.privateKey }), false);
await tryIt('unknown key id', await jwt(good, { kid: 'nope' }), false);
await tryIt('test token without test mode', 'test:eve:Eve', false);
const s = await makeSession(env, 'g1234567890');
console.log('session round trip:', (await readSession(env, s)) === 'g1234567890', '| tampered:', await readSession(env, s.replace(/.$/, c => (c === 'A' ? 'B' : 'A'))));
