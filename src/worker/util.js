export const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const err = (message, status = 400) => json({ error: message }, status);

export function rid(n = 18) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// data:image/jpeg;base64,... -> { mime, b64, bytes }
export function parseDataUrl(u, maxBytes = 3_000_000) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u || '');
  if (!m) return null;
  const bin = atob(m[2]);
  if (bin.length > maxBytes) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime: m[1], b64: m[2], bytes };
}

// Stellar account address check (G..., version byte + CRC16-XModem).
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32(s) {
  let bits = 0, val = 0; const out = [];
  for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) return null; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Uint8Array.from(out);
}
function crc16(bytes) {
  let crc = 0;
  for (const b of bytes) { crc ^= b << 8; for (let i = 0; i < 8; i++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xffff; } }
  return crc;
}
export function validAccount(a) {
  if (!/^G[A-Z2-7]{55}$/.test(a || '')) return false;
  const b = b32(a);
  if (!b || b.length !== 35 || b[0] !== 6 << 3) return false;
  return (b[33] | (b[34] << 8)) === crc16(b.subarray(0, 33));
}

const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeCode(name) {
  const letters = (name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^(THE|EL|LA|LOS|LAS|O|OS|A|AS|BAR|TASCA|CASA|RESTAURANTE|CERVEJARIA|TABERNA)\s+/, '').replace(/[^A-Z]/g, '');
  const head = (letters || 'QUITS').slice(0, 4);
  const r = crypto.getRandomValues(new Uint8Array(3));
  return head + [...r].map(x => ALPHA[x % ALPHA.length]).join('');
}

export const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);
