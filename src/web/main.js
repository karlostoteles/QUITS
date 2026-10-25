import { gsap } from 'gsap';
import qrcode from 'qrcode-generator';
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { shares, lineAlloc, unitsClaimed, lines, memoFor, dueAmount, NETWORKS, SWATCHES, short, splitCents, gamePool, gameFree } from '../shared/logic.js';
import { commitmentOf, sealMessage, hex, unhex, randomBytes } from '../shared/game.js';
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

/* ================= basics ================= */
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = d => (RM ? 0.01 : d);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const h = html => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const later = (ms, fn) => setTimeout(fn, ms);
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const FRAC = { 2: '½', 3: '⅓', 4: '¼', 5: '⅕', 6: '⅙' };

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>', back: '<path d="M15 18l-6-6 6-6"/>', chev: '<path d="M9 6l6 6-6 6"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  sparkle: '<path d="M12 3.5l1.7 5 5 1.8-5 1.8-1.7 5-1.8-5-5-1.8 5-1.8z"/>', pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 9v.01M17.5 15v.01"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1.2"/><rect x="14" y="4" width="6" height="6" rx="1.2"/><rect x="4" y="14" width="6" height="6" rx="1.2"/><path d="M14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h2M20 14v2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.2a3 3 0 0 1 0 5.8M17.5 14a5 5 0 0 1 3 4.6"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><path d="M4 7v10a2 2 0 0 0 2 2h14V9H6a2 2 0 0 1-2-2z"/><path d="M16 14h.01"/>',
  share: '<path d="M12 3v12"/><path d="M7.5 7.5L12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>', send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>', trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  ext: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 10a2.5 2.5 0 0 1 5 0c0 2.5-5 1.5-5 4a2.5 2.5 0 0 0 5 0"/>',
  fist: '<path d="M7 11V8.5a2 2 0 0 1 4 0V11"/><path d="M11 10V7a2 2 0 0 1 4 0v3"/><path d="M15 10.5V8.5a2 2 0 0 1 4 0V14a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6v-2.5a2 2 0 0 1 4 0V13"/>',
};
const ic = (n, s = 20) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ================= local storage (per device) ================= */
const LS = {
  get(k, d) { try { const v = localStorage.getItem('quits:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('quits:' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};
const ACCEPT = ['USDC']; // EURC works end to end too; switched off to keep one currency everywhere
let PROFILE = LS.get('me', { name: '', color: '', contact: '', address: '', accept: ACCEPT });
const saveProfile = () => LS.set('me', PROFILE);
const credsFor = code => LS.get('t:' + code, null);
const nights = () => LS.get('nights', []);
function rememberNight(s, me = ME && ME.pid) {
  const list = nights().filter(n => n.code !== s.code);
  const sh = s.receipt ? shares(s) : null;
  list.push({
    code: s.code, name: s.name, coverId: s.coverId, at: s.t0, phase: s.phase, role: me === s.host ? 'host' : 'guest',
    n: s.order.length, total: sh ? sh.all : 0, currency: s.currency,
    people: s.order.filter(id => id !== me).map(id => ({ name: s.people[id].name, color: s.people[id].color, contact: s.people[id].contact || '' })),
  });
  list.sort((a, b) => (b.at || 0) - (a.at || 0));
  LS.set('nights', list.slice(0, 120));
}

/* ================= money & dates ================= */
const money = (c, cur) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: cur || (S && S.currency) || 'EUR' }).format((c || 0) / 100);
const eur = c => money(c);
const paperAmt = c => { const v = ((c || 0) / 100).toFixed(2); return S && S.currency === 'USD' ? v : v.replace('.', ','); };
const dayLabel = t => new Date(t || Date.now()).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeLabel = t => new Date(t || Date.now()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const stampDate = t => { const d = new Date(t || Date.now()); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const fmtL = n => Number(n || 0).toLocaleString('en-US');
const cover = s => (s && s.coverId ? `/api/t/${s.code}/img/${s.coverId}` : '');
const imgUrl = (code, id) => `/api/t/${code}/img/${id}`;
const tableUrl = code => `${location.origin}/t/${code}`;
const nightUrl = code => `${location.origin}/n/${code}`;

/* ================= state, events, network ================= */
let S = null, ME = null, CODE = null, HEALTH = { network: 'testnet' };
let SESSION = LS.get('session', ''), USER = null;
const bus = new EventTarget();
const emit = (type, detail = {}) => bus.dispatchEvent(new CustomEvent(type, { detail }));
function on(type, fn, bag) { const f = e => fn(e.detail || {}); bus.addEventListener(type, f); if (bag) bag.push(() => bus.removeEventListener(type, f)); }
const P = id => (S && S.people[id]) || { name: '?', color: '#888' };
const col = id => P(id).color;
const av = (id, z = 32, cls = '') => `<span class="av ${cls}" data-pid="${esc(id)}" style="--c:${col(id)};--z:${z}px">${esc((P(id).name || '?')[0].toUpperCase())}</span>`;
const isHost = () => !!(S && ME && ME.pid === S.host);
const meIn = () => !!(S && ME && S.people[ME.pid]);
const tableOpen = () => S && ['open', 'scanning', 'claiming'].includes(S.phase);

async function api(path, body, creds) {
  const inv = LS.get('invite', '');
  const r = await fetch('/api' + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(SESSION ? { authorization: 'Bearer ' + SESSION } : {}), ...(inv ? { 'x-quits-invite': inv } : {}), ...(creds ? { 'x-quits-pid': creds.pid, 'x-quits-token': creds.token || '' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok) throw Object.assign(new Error(j.error || 'Something went wrong. Try again.'), { status: r.status, need: j.need });
  return j;
}
async function act(type, payload = {}) {
  try {
    const j = await api(`/t/${CODE}/act`, { type, ...payload }, ME);
    if (j.s) applyState(j.s);
    return j;
  } catch (e) {
    UI.toast(`${ic('close', 18)}<div><b>${esc(e.message)}</b></div>`, 3200);
    refresh();
    throw e;
  }
}
async function refresh() { if (!CODE) return; try { const j = await api(`/t/${CODE}/state`, null, ME); applyState(j.s); } catch (e) { /* offline */ } }

function applyState(ns) {
  if (!ns || ns.code !== CODE) return;
  if (S && ns.rev && S.rev && ns.rev < S.rev) return; // a late reply; a newer state is already here
  const os = S; S = ns;
  if (ME && ns.people[ME.pid]) rememberNight(ns);
  if (!os) { emit('state'); return; }
  ns.order.filter(id => !os.order.includes(id)).forEach(pid => emit('join', { pid }));
  if (JSON.stringify(os.receipt) !== JSON.stringify(ns.receipt)) emit('receipt');
  for (const l of lines(ns)) if (JSON.stringify((os.claims || {})[l.id] || {}) !== JSON.stringify((ns.claims || {})[l.id] || {})) emit('claims', { lid: l.id });
  if (os.tip !== ns.tip) emit('claims', {});
  if (JSON.stringify(os.ready) !== JSON.stringify(ns.ready)) emit('ready', {});
  if (!os.leftover && ns.leftover && os.receipt) emit('leftover', { cents: shares(os).leftRaw });
  for (const pid in ns.paid) { const a = os.paid[pid], b = ns.paid[pid]; if (!a) emit('paid', { pid }); else if (!a.confirmed && b.confirmed) emit('paid', { pid, confirm: true }); }
  const had = new Set(os.photos.map(p => p.id));
  ns.photos.filter(p => !had.has(p.id)).reverse().forEach(p => emit('photo', { photo: p, pid: p.by }));
  if (JSON.stringify(os.intents) !== JSON.stringify(ns.intents)) emit('intents');
  if (os.name !== ns.name) emit('rename');
  if (JSON.stringify(os.game) !== JSON.stringify(ns.game)) emit('game', { from: os.game });
  if (os.phase !== ns.phase) emit('phase', { from: os.phase });
  emit('state');
}

let WS = null, wsRetry = null, wsTries = 0, wsPing = null;
function connect(code) {
  disconnect();
  const qs = new URLSearchParams();
  if (ME && ME.token) { qs.set('pid', ME.pid); qs.set('token', ME.token); }
  if (SESSION) qs.set('session', SESSION);
  const q = qs.toString() ? '?' + qs : '';
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/t/${code}/ws${q}`);
  WS = ws;
  ws.onopen = () => { wsTries = 0; wsPing = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000); };
  ws.onmessage = e => { if (e.data === 'pong') return; try { const m = JSON.parse(e.data); if (m.t === 'state') applyState(m.s); } catch (err) { /* ignore */ } };
  ws.onclose = () => { clearInterval(wsPing); if (WS !== ws) return; wsRetry = setTimeout(() => connect(code), Math.min(8000, 700 * 2 ** wsTries++)); };
}
function disconnect() { clearTimeout(wsRetry); clearInterval(wsPing); if (WS) { const w = WS; WS = null; try { w.close(); } catch (e) { /* closed */ } } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && CODE) { refresh(); if (!WS || WS.readyState > 1) connect(CODE); } });

/* ================= account (Sign in with Google) ================= */
const accounts = () => !!HEALTH.accounts;
const signedIn = () => !!(SESSION && USER);
const inWebview = /FBAN|FBAV|Instagram|Line\/|; wv\)|MicroMessenger|TikTok/i.test(navigator.userAgent);
function setUser(u) {
  USER = u || null;
  if (USER && USER.profile) {
    const p = USER.profile;
    PROFILE = { ...PROFILE, name: p.name || PROFILE.name, contact: p.contact || PROFILE.contact, address: p.address || PROFILE.address, color: p.color || PROFILE.color, accept: p.accept && p.accept.length ? p.accept : PROFILE.accept };
    saveProfile();
  }
}
function signOutLocal() { SESSION = ''; USER = null; LS.set('session', ''); try { window.google && google.accounts.id.disableAutoSelect(); } catch (e) { /* not loaded */ } }
async function loadMe() {
  if (!SESSION) return null;
  try { setUser((await api('/me')).user); } catch (e) { if (e.status === 401) signOutLocal(); }
  return USER;
}
async function pushProfile(patch) { if (!signedIn()) return; try { setUser((await api('/me', patch)).user); } catch (e) { /* stays on this phone */ } }
async function signIn(credential) {
  const j = await api('/auth/google', { credential });
  SESSION = j.session; LS.set('session', SESSION); setUser(j.user);
  // seats taken on this phone before signing in move to the account
  const seats = [];
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('quits:t:')) { const c = LS.get(k.slice(6), null); if (c && c.pid && c.token) seats.push({ code: k.slice(8), pid: c.pid, token: c.token }); } } catch (e) { /* no storage */ }
  if (seats.length) { try { setUser((await api('/me/link', { tables: seats })).user); } catch (e) { /* later */ } }
  const p = USER.profile || {}, patch = {};
  ['contact', 'address', 'color'].forEach(k => { if (!p[k] && PROFILE[k]) patch[k] = PROFILE[k]; });
  if (Object.keys(patch).length) await pushProfile(patch);
  return USER;
}
function meAvatar(z = 34) {
  const c = PROFILE.color || '#FFE45C', init = esc((PROFILE.name || (USER && USER.name) || '·')[0].toUpperCase());
  return USER && USER.picture
    ? `<span class="av av-pic" style="--c:${c};--z:${z}px"><img src="${esc(USER.picture)}" alt="" referrerpolicy="no-referrer"></span>`
    : `<span class="av" style="--c:${c};--z:${z}px">${init}</span>`;
}
let gisP = null, gisReady = false, gisDone = null;
function loadGIS() {
  if (!gisP) gisP = new Promise((res, rej) => {
    if (window.google && google.accounts && google.accounts.id) return res(google.accounts.id);
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => (window.google && google.accounts && google.accounts.id ? res(google.accounts.id) : rej(new Error('no gis')));
    sc.onerror = () => { gisP = null; rej(new Error('no gis')); };
    document.head.appendChild(sc);
  });
  return gisP;
}
// Puts a "Continue with Google" button in slot; onDone runs once signed in.
async function googleButton(slot, onDone) {
  const run = async credential => {
    slot.classList.add('busy');
    try { await signIn(credential); await onDone(); }
    catch (e) { UI.toast(`<div><b>Sign-in didn’t work</b><small>${esc(e.message)}</small></div>`, 3600); }
    slot.classList.remove('busy');
  };
  if (HEALTH.authTest) {
    slot.innerHTML = `<button class="btn primary gtest" type="button"><span class="g-logo">G</span>Continue with Google</button>`;
    $('button', slot).addEventListener('click', () => run('test:' + (window.__quitsTestUser || 'tester:Tester')));
    return;
  }
  if (inWebview) { slot.innerHTML = `<p class="gnote">To sign in with Google, open this page in Safari or Chrome.</p>`; return; }
  slot.innerHTML = '<span class="gskel">Continue with Google</span>';
  try {
    const id = await loadGIS();
    if (!gisReady) { id.initialize({ client_id: HEALTH.google, callback: r => gisDone && gisDone(r.credential), ux_mode: 'popup', auto_select: false, cancel_on_tap_outside: true, itp_support: true, use_fedcm_for_button: true }); gisReady = true; }
    gisDone = run;
    slot.innerHTML = '';
    id.renderButton(slot, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', logo_alignment: 'center', width: Math.round(Math.min(400, Math.max(220, slot.clientWidth || 320))) });
  } catch (e) { slot.innerHTML = `<p class="gnote">Google sign-in didn’t load. Check your connection and reload.</p>`; }
}
// Where someone goes when they want to open a table.
function openTablePath() {
  if (accounts() && !signedIn()) return '/';
  if (HEALTH.invite && !(accounts() ? USER.invited : LS.get('invite', ''))) return '/invite?next=new';
  return '/new';
}
// Where someone goes right after signing in on the welcome screen.
function afterSignIn() { nav(HEALTH.invite && !USER.invited ? '/invite?next=home' : '/', { dir: 'fwd' }); }

/* ================= images ================= */
function compress(file, edge = 1600, q = 0.82) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, edge / Math.max(im.width, im.height));
      const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not open that photo')); };
    im.src = url;
  });
}
function shrink(dataUrl, edge) {
  return new Promise(res => { const im = new Image(); im.onload = () => { const k = Math.min(1, edge / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.8)); }; im.src = dataUrl; });
}

/* ================= components ================= */
let RID = 0;
function qrSVG(text, ecc = 'M') {
  let q;
  try { q = qrcode(0, ecc); q.addData(text); q.make(); } catch (e) { return '<svg viewBox="0 0 1 1"></svg>'; }
  const n = q.getModuleCount(), mid = (n - 1) / 2, maxd = Math.hypot(mid, mid);
  const fin = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  let m = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!q.isDark(r, c) || fin(r, c)) continue;
    m += `<rect class="qm" data-d="${(Math.hypot(r - mid, c - mid) / maxd).toFixed(2)}" x="${c + .04}" y="${r + .04}" width=".92" height=".92" rx=".28"/>`;
  }
  const f = (x, y) => `<rect x="${x + .5}" y="${y + .5}" width="6" height="6" rx="1.7" fill="none" stroke="currentColor" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx=".8"/>`;
  return `<svg viewBox="0 0 ${n} ${n}" fill="currentColor" role="img" aria-label="QR code">${m}${f(0, 0)}${f(n - 7, 0)}${f(0, n - 7)}</svg>`;
}
function ringText(txt) { const id = 'rt' + (++RID); return `<svg class="ring-text" viewBox="0 0 200 200" aria-hidden="true"><defs><path id="${id}" d="M100,100 m-88,0 a88,88 0 1,1 176,0 a88,88 0 1,1 -176,0"/></defs><text><textPath href="#${id}" textLength="548" lengthAdjust="spacing">${txt}</textPath></text></svg>`; }
function stampSVG(line) {
  const sub = line || `${esc(S.name).toUpperCase().slice(0, 20)} · ${stampDate(S.t0)}`;
  return `<svg class="stamp" viewBox="0 0 280 124" aria-hidden="true"><g filter="url(#q-ink)" style="color:var(--stamp)"><rect x="5" y="5" width="270" height="114" rx="16" fill="none" stroke="currentColor" stroke-width="6"/><rect x="15" y="15" width="250" height="94" rx="9" fill="none" stroke="currentColor" stroke-width="2"/><text x="140" y="78" text-anchor="middle" fill="currentColor" style="font-family:var(--f-display);font-weight:900;font-size:68px;font-stretch:62%;letter-spacing:5px">QUITS</text><text x="140" y="100" text-anchor="middle" fill="currentColor" style="font-family:var(--f-mono);font-weight:600;font-size:10.5px;letter-spacing:1.6px">${sub}</text></g></svg>`;
}
const coverImg = (s, cls = '') => (cover(s) ? `<img class="${cls}" src="${cover(s)}" alt="">` : `<div class="${cls} nocover"></div>`);
function evMini(status) { return `<div class="ev-mini">${coverImg(S)}<div><b>${esc(S.name)}</b><span>${status}</span></div></div>`; }
function ticketHTML(stub) {
  return `<div class="ticket"><div class="tk-img">${coverImg(S)}<div class="tk-grad"></div><div class="tk-t"><b class="t-xl">${esc(S.name)}</b><span>${dayLabel(S.t0)} · ${timeLabel(S.t0)}</span></div></div><div class="tk-perf"></div><div class="tk-stub">${stub}</div></div>`;
}

// The thermal receipt. mode: print | claim | review | mini
function Receipt({ mode = 'print', draft = null } = {}) {
  const claim = mode === 'claim', review = mode === 'review', mini = mode === 'mini';
  const L = draft || lines(S);
  const total = L.reduce((a, l) => a + l.total, 0);
  const lineHTML = (l, i) => `<div class="rc-line" data-id="${esc(l.id || 'd' + i)}" data-i="${i}"${claim || review ? ' role="button" tabindex="0"' : ''}${claim ? ' aria-pressed="false"' : ''}><span class="rc-marks" aria-hidden="true"></span><span class="rc-row"><span class="rc-q">${l.qty}</span><span class="rc-n">${esc(l.name)}</span><span class="rc-p">${paperAmt(l.total)}</span></span>${claim ? '<span class="rc-gl"><span class="gl-t"></span><span class="rc-who"></span></span>' : ''}${review ? `<span class="rc-gl"><span class="gl-t">${esc(l.en || '')}${l.kind === 'shared' ? ' · shared' : l.kind === 'each' ? ` · ${money(Math.round(l.total / l.qty))} each` : ''}</span><span class="rc-edit">${ic('edit', 14)}</span></span>` : ''}</div>`;
  const el = h(`<div class="rcpt ${mode}"><div class="rcpt-paper">
    <div class="rc-venue">${esc(S.name.toUpperCase())}</div>
    <div class="rc-c">${dayLabel(S.t0).toUpperCase()} · ${timeLabel(S.t0)} · MESA ${esc(S.code)}</div>
    <div class="rc-rule"></div>
    ${mini ? '' : '<div class="rc-row rc-cols"><span class="rc-q">QT</span><span class="rc-n">ITEM</span><span class="rc-p">TOTAL</span></div>'}
    <div class="rc-lines">${L.map(lineHTML).join('')}</div>
    ${review ? `<button class="addline" type="button" data-rv="add">${ic('plus', 14)}Add a line</button>` : ''}
    <div class="rc-rule"></div>
    <div class="rc-row rc-total"><span>TOTAL</span><span class="grow"></span><span class="rc-p">${S.currency === 'USD' ? '$' : '€'} ${paperAmt(total)}</span></div>
    ${mini ? '' : `<div class="rc-c rc-thanks" style="margin-top:10px">READ BY QUITS · ${L.length} LINES</div>`}
  </div></div>`);
  const map = new Map($$('.rc-line', el).map(e => [e.dataset.id, e]));
  function segments(l) {
    const c = S.claims[l.id] || {}, ids = S.order.filter(id => c[id] > 0), segs = [];
    let x = 0;
    if (l.kind === 'each') ids.forEach(id => { const w = c[id] / l.qty; segs.push({ k: id, color: col(id), from: x, w }); x += w; });
    else if (ids.length) { const w = 1 / ids.length; ids.forEach(id => { segs.push({ k: id, color: col(id), from: x, w }); x += w; }); x = 1; }
    if (S.leftover && x < .999) segs.push({ k: '_left', left: true, from: x, w: 1 - x });
    return segs;
  }
  function paint(lid, animate = true) {
    const l = lines(S).find(x => x.id === lid), le = map.get(lid); if (!l || !le) return;
    const box = le.querySelector('.rc-marks'), segs = segments(l), anim = animate && !RM;
    const old = new Map([...box.children].map(c => [c.dataset.k, c]));
    segs.forEach(sg => {
      let m = old.get(sg.k);
      const Lp = (sg.from * 100).toFixed(2) + '%', Wd = (sg.w * 100).toFixed(2) + '%';
      if (!m) { m = document.createElement('i'); m.className = 'mk'; m.dataset.k = sg.k; box.appendChild(m); if (anim) { m.style.left = Lp; m.style.width = '0%'; } }
      if (sg.left) m.style.background = `repeating-linear-gradient(-45deg,${S.order.map((id, i) => `${col(id)} ${i * 6}px ${(i + 1) * 6}px`).join(',')})`;
      else m.style.setProperty('--c', sg.color);
      old.delete(sg.k);
      if (anim) gsap.to(m, { left: Lp, width: Wd, duration: .6, ease: 'power3.out', overwrite: true }); else { m.style.left = Lp; m.style.width = Wd; }
    });
    old.forEach(m => { if (anim) gsap.to(m, { width: '0%', duration: .3, overwrite: true, onComplete: () => m.remove() }); else m.remove(); });
    if (claim) paintClaim(l, le);
  }
  function paintClaim(l, le) {
    const me = ME && ME.pid, c = S.claims[l.id] || {}, mine = c[me] || 0, ids = S.order.filter(id => c[id] > 0), n = ids.length, unit = Math.round(l.total / l.qty);
    le.classList.toggle('mine', mine > 0); le.setAttribute('aria-pressed', String(mine > 0));
    let t;
    const en = l.en ? l.en + ' · ' : '';
    if (l.kind === 'each') t = `${en}${money(unit)} each · ${unitsClaimed(S, l.id)} of ${l.qty} claimed`;
    else if (l.kind === 'shared') t = n > 1 ? `${en}split ${n} ways` : n === 1 ? `${en}${mine ? 'only you so far' : P(ids[0]).name + ' so far'}` : `${en}shared by whoever had it`;
    else t = n > 1 ? `${en}split ${n} ways` : (l.en || 'Tap if it was yours');
    if (S.leftover && lineAlloc(S, l).left > 0) t += ' · leftover, split by all';
    le.querySelector('.gl-t').textContent = t;
    const others = ids.filter(id => id !== me);
    le.querySelector('.rc-who').innerHTML = (mine && l.kind === 'each' ? `<span class="stepper"><button type="button" data-d="-1" aria-label="One less">−</button><b>${mine}</b><button type="button" data-d="1" aria-label="One more">+</button></span>` : '') + others.map(id => av(id, 18)).join('');
  }
  const paintAll = (animate = true) => lines(S).forEach(l => paint(l.id, animate));
  return { el, paint, paintAll, map };
}

function YourPart(id) {
  const s = shares(S), rows = [];
  lines(S).forEach(l => {
    const c = S.claims[l.id] || {}; if (!c[id]) return;
    const a = lineAlloc(S, l), ids = S.order.filter(x => c[x] > 0);
    const q = l.kind === 'each' ? String(c[id]) : (ids.length > 1 ? (FRAC[ids.length] || `1/${ids.length}`) : '1');
    rows.push(`<div class="rc-line"><span class="rc-marks"><i class="mk" style="--c:${col(id)};left:0;width:100%"></i></span><span class="rc-row"><span class="rc-q">${q}</span><span class="rc-n">${esc(l.name)}</span><span class="rc-p">${paperAmt(a.out[id] || 0)}</span></span></div>`);
  });
  if (s.leftShare[id]) rows.push(`<div class="rc-line"><span class="rc-row"><span class="rc-q">·</span><span class="rc-n">LEFTOVERS, SPLIT BY ALL</span><span class="rc-p">${paperAmt(s.leftShare[id])}</span></span></div>`);
  if (s.tip[id]) rows.push(`<div class="rc-line"><span class="rc-row"><span class="rc-q">·</span><span class="rc-n">TIP ${S.tip}%</span><span class="rc-p">${paperAmt(s.tip[id])}</span></span></div>`);
  return h(`<div class="rcpt mini"><div class="rcpt-paper"><div class="rc-venue">${esc(S.name.toUpperCase())}</div><div class="rc-c">YOUR PART · ${esc(P(id).name.toUpperCase())}</div><div class="rc-rule"></div><div class="rc-lines">${rows.join('')}</div><div class="rc-rule"></div><div class="rc-row rc-total"><span>TOTAL</span><span class="grow"></span><span class="rc-p">${S.currency === 'USD' ? '$' : '€'} ${paperAmt(s.total[id] || 0)}</span></div></div></div>`);
}

function TableRing({ size = 320, tableR = 96, seatR = 21, gap = 30, empty = false, labels = true } = {}) {
  const el = h(`<div class="ring" style="--size:${size}px;--tr:${tableR}px;--sr:${seatR}px"><div class="ring-table"><div class="ring-center"></div></div></div>`);
  const R = tableR + gap, seats = new Map();
  let emptySeat = null;
  function place(s, a) {
    s._a = a; const r = a * Math.PI / 180;
    s.style.transform = `translate(${(Math.cos(r) * R).toFixed(2)}px,${(Math.sin(r) * R).toFixed(2)}px)`;
    const l = s.querySelector('.seat-l');
    if (l) { const c = Math.cos(r), sn = Math.sin(r), off = seatR + 6, ax = c > .3 ? '0%' : c < -.3 ? '-100%' : '-50%', ay = Math.abs(c) <= .3 ? (sn > 0 ? '0%' : '-100%') : '-50%'; l.style.transform = `translate(calc(${ax} + ${(c * off).toFixed(1)}px),calc(${ay} + ${(sn * off).toFixed(1)}px))`; }
  }
  function move(s, to, animate) {
    if (!animate || RM || s._a === undefined) { place(s, to); return; }
    const from = s._a, d = ((to - from) % 360 + 540) % 360 - 180, o = { a: from };
    gsap.to(o, { a: from + d, duration: .85, ease: 'power3.inOut', onUpdate: () => place(s, o.a) });
  }
  const make = id => h(`<div class="seat" data-id="${esc(id)}" style="--c:${col(id)}"><div class="seat-in">${av(id, seatR * 2)}<svg class="seat-prog" viewBox="0 0 52 52" aria-hidden="true"><circle class="sp-bg" cx="26" cy="26" r="24.5" pathLength="100"/><circle class="sp-fg" cx="26" cy="26" r="24.5" pathLength="100"/></svg><span class="seat-badge">${ic('check', 12)}</span></div>${labels ? `<span class="seat-l">${esc(P(id).name)}</span>` : ''}</div>`);
  function set(ids, animate = true) {
    const n = ids.length + (empty ? 1 : 0), step = 360 / Math.max(n, 1);
    ids.forEach((id, i) => {
      const a = 90 + i * step; let s = seats.get(id);
      if (!s) {
        s = make(id); el.appendChild(s); seats.set(id, s); place(s, a);
        if (animate && !RM) { gsap.from(s.querySelector('.seat-in'), { scale: 0, duration: .7, ease: 'back.out(2.4)' }); const lb = s.querySelector('.seat-l'); if (lb) gsap.from(lb, { opacity: 0, duration: .4, delay: .25 }); gsap.fromTo(el.querySelector('.ring-table'), { scale: 1 }, { scale: 1.035, duration: .16, yoyo: true, repeat: 1, ease: 'power2.out' }); }
      } else move(s, a, animate);
    });
    if (empty) { const a = 90 + ids.length * step; if (!emptySeat) { emptySeat = h(`<div class="seat empty"><div class="seat-in">${ic('plus', 16)}</div></div>`); el.appendChild(emptySeat); place(emptySeat, a); } else move(emptySeat, a, animate); }
    seats.forEach((s, id) => { if (!ids.includes(id)) { s.remove(); seats.delete(id); } });
  }
  function state(id, st, p) { const s = seats.get(id); if (!s) return; s.classList.toggle('choosing', st === 'choosing'); s.classList.toggle('paid', st === 'paid'); s.querySelector('.sp-fg').style.strokeDasharray = `${Math.round(p * 100)} 100`; }
  return { el, set, state, seat: id => seats.get(id), center(html) { $('.ring-center', el).innerHTML = html; } };
}

function roll(el, to, fmt = eur, dur = .75) {
  if (!el) return;
  const from = el._v ?? to; el._v = to;
  if (RM || from === to) { el.textContent = fmt(to); return; }
  const o = { v: from };
  gsap.to(o, { v: to, duration: dur, ease: 'power2.out', onUpdate: () => { el.textContent = fmt(Math.round(o.v)); } });
}
const setNum = (el, v, fmt = eur) => { if (el) { el._v = v; el.textContent = fmt(v); } };
async function copyText(text, btn, label = 'Copied') {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) { ok = false; }
  if (!btn) return ok;
  const sp = btn.querySelector('span') || btn; const prev = sp.textContent;
  sp.textContent = ok ? label : 'Select and copy';
  later(1500, () => { sp.textContent = prev; });
  return ok;
}
function shake(el) { if (!RM) gsap.fromTo(el, { x: -6 }, { x: 0, duration: .4, ease: 'elastic.out(1.2, .3)' }); }
function busy(btn, on, label) { if (!btn) return; if (on) { btn._html = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin dark"></span>${label ? `<span>${esc(label)}</span>` : ''}`; } else { btn.disabled = false; if (btn._html) btn.innerHTML = btn._html; } }

/* ================= screens ================= */
const SCREENS = {};
const UI = {
  root: null, toasts: null, cur: null,
  go(name, opts = {}) {
    const def = SCREENS[name]; if (!def) return;
    const prev = this.cur, ctx = { bag: [], opts, name };
    const el = def.render(ctx); el.classList.add('scr'); el.dataset.screen = name; ctx.el = el;
    this.root.insertBefore(el, this.toasts);
    if (prev) { prev.ctx.dead = true; prev.ctx.bag.forEach(f => { try { f(); } catch (e) { /* gone */ } }); }
    this.cur = { name, def, ctx, el };
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t || !el.contains(t) || t.disabled) return;
      const fn = def.act && def.act[t.dataset.act];
      if (fn) { e.preventDefault(); fn(ctx, t, e); }
    });
    swap(prev && prev.el, el, opts.dir || (prev ? 'fwd' : 'none'));
    if (def.enter) def.enter(ctx);
    return ctx;
  },
  toast(html, ms = 3000) {
    const t = h(`<div class="toast">${html}</div>`);
    this.toasts.prepend(t);
    while (this.toasts.children.length > 2) this.toasts.lastElementChild.remove();
    gsap.fromTo(t, { y: -28, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: D(.45), ease: 'back.out(1.7)' });
    later(ms, () => gsap.to(t, { y: -18, opacity: 0, duration: D(.3), onComplete: () => t.remove() }));
  },
};
function swap(old, neu, dir) {
  if (!old) return;
  old.style.pointerEvents = 'none';
  const done = () => old.remove();
  if (RM || dir === 'none') { done(); return; }
  const E = 'power3.out', T = .5;
  if (dir === 'fwd') { gsap.fromTo(neu, { xPercent: 100 }, { xPercent: 0, duration: T, ease: E, clearProps: 'transform' }); gsap.to(old, { xPercent: -26, opacity: .35, duration: T, ease: E, onComplete: done }); }
  else if (dir === 'back') { old.style.zIndex = 2; gsap.fromTo(neu, { xPercent: -26, opacity: .4 }, { xPercent: 0, opacity: 1, duration: T, ease: E, clearProps: 'transform,opacity' }); gsap.to(old, { xPercent: 100, duration: T, ease: E, onComplete: done }); }
  else if (dir === 'up') { gsap.fromTo(neu, { yPercent: 100 }, { yPercent: 0, duration: .6, ease: 'power3.inOut', clearProps: 'transform' }); gsap.to(old, { yPercent: -12, opacity: .3, duration: .6, ease: 'power3.inOut', onComplete: done }); }
  else { gsap.fromTo(neu, { opacity: 0, scale: 1.03 }, { opacity: 1, scale: 1, duration: .55, ease: E, clearProps: 'transform,opacity' }); gsap.to(old, { opacity: 0, duration: .35, onComplete: done }); }
}
function nav(path, opts = {}) { if (location.pathname !== path) history.pushState({}, '', path); route(opts); }

/* ---------- welcome: the first screen, before signing in ---------- */
const HERO = {
  friends: [['A', '#FF8AC2'], ['M', '#7FD3FF'], ['T', '#A6F06A'], ['C', '#FFE45C']],
  lines: [['2', 'IMPERIAL', '5,60', [3, 0]], ['1', 'POLVO À LAGAREIRO', '23,90', [3]], ['1', 'ARROZ DE MARISCO 2P', '36,00', [1, 2]], ['2', 'VINHO VERDE', '32,00', [0, 3, 1, 2]], ['4', 'PASTEL DE NATA', '6,40', [0, 1, 2, 3]]],
};
function heroHTML() {
  const L = HERO.lines.map(([q, n, p, who]) => `<div class="rc-line"><span class="rc-marks">${who.map((f, i) => `<i class="mk" style="--c:${HERO.friends[f][1]};left:${(i * 100 / who.length).toFixed(2)}%;width:${(100 / who.length).toFixed(2)}%"></i>`).join('')}</span><span class="rc-row"><span class="rc-q">${q}</span><span class="rc-n">${n}</span><span class="rc-p">${p}</span></span></div>`).join('');
  return `<div class="wl-hero" aria-hidden="true">
    <div class="rcpt print"><div class="rcpt-paper"><div class="rc-venue">O CANTINHO</div><div class="rc-c">FRI 24 OCT · 22:47 · LISBOA</div><div class="rc-rule"></div><div class="rc-lines">${L}</div><div class="rc-rule"></div><div class="rc-row rc-total"><span>TOTAL</span><span class="grow"></span><span class="rc-p">€ 103,90</span></div></div></div>
    <div class="wl-stamp">${stampSVG('O CANTINHO · 24.10.2026')}</div>
    ${HERO.friends.map(([n, c], i) => `<span class="av wl-av f${i}" style="--c:${c};--z:38px">${n}</span>`).join('')}
  </div>`;
}
function heroMotion(ctx) {
  if (RM) return;
  const el = ctx.el, marks = $$('.wl-hero .mk', el), avs = $$('.wl-av', el), stamp = $('.wl-stamp', el), paper = $('.wl-hero .rcpt', el);
  const widths = marks.map(m => m.style.width);
  const tl = gsap.timeline({ repeat: -1, repeatDelay: 2.2, delay: .35 });
  gsap.from(avs, { scale: 0, duration: .5, ease: 'back.out(2.6)', stagger: .09, delay: .5 });
  tl.set(marks, { width: '0%' }).set(stamp, { opacity: 0 })
    .to(marks, { width: (i) => widths[i], duration: .42, ease: 'power3.out', stagger: .13 }, .35)
    .fromTo(stamp, { scale: 2.6, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: -12, duration: .28, ease: 'power4.in' }, '+=.25')
    .to(paper, { x: -5, y: 3, duration: .05, yoyo: true, repeat: 3, ease: 'none' })
    .to([stamp, ...marks], { opacity: 0, duration: .5, delay: 2.4 })
    .set(marks, { opacity: 1, width: '0%' });
  ctx.bag.push(() => tl.kill());
  gsap.from($('.wl-hero .rcpt', el), { y: 60, rotation: 6, opacity: 0, duration: .8, ease: 'power3.out' });
  gsap.from($$('.wl-brand, .wl-h, .wl-sub, .wl-steps > *', el), { y: 18, opacity: 0, duration: .55, stagger: .07, ease: 'power3.out', delay: .2 });
  gsap.from($('.wm-hl', el), { scaleX: 0, duration: .7, ease: 'power3.out', delay: .35 });
}
SCREENS.welcome = {
  render() {
    return h(`<section class="welcome">
      <div class="wl-glow" aria-hidden="true"></div>
      <header class="scr-head"><span class="grow"></span>${netPill()}</header>
      <div class="scr-body wl-body">
        ${heroHTML()}
        <div class="wl-brand"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span></div>
        <h1 class="t-xxl wl-h">Split the bill at the table.</h1>
        <p class="sub wl-sub">Snap the receipt, everyone taps what they had, and they pay you back from their own wallet. On Stellar.</p>
        <div class="wl-steps"><span>${ic('camera', 16)}Snap</span><span>${ic('qr', 16)}Share the QR</span><span>${ic('check', 16)}Quits</span></div>
      </div>
      <footer class="scr-foot wl-foot">
        ${accounts() ? '<div class="gbtn"></div>' : '<button class="btn primary" type="button" data-act="start">Get started</button>'}
        <p class="foot-note">Joining a friend’s table? Scan their QR. No account needed.</p>
        <a class="wl-link" href="/privacy" data-act="privacy">Privacy</a>
      </footer>
    </section>`);
  },
  enter(ctx) {
    heroMotion(ctx);
    if (accounts()) googleButton($('.gbtn', ctx.el), async () => afterSignIn());
  },
  act: {
    start() { LS.set('welcomed', 1); nav('/'); },
    privacy() { nav('/privacy'); },
  },
};
SCREENS.privacy = {
  render() {
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back">${ic('back', 22)}</button><span class="head-t">Privacy</span></header>
      <div class="scr-body prose">
        <h1 class="t-xl">What Quits keeps</h1>
        <p>Only what it needs to split a bill with friends.</p>
        <ul>
          <li><b>Your Google name, email and picture</b>, if you sign in with Google. They show who you are at a table and keep your nights in your account.</li>
          <li><b>What you add at a table:</b> your name and colour, an optional Telegram or X handle that only people at that table see, photos, the receipt and what you tapped.</li>
          <li><b>Your Stellar address</b>, if you add one, so friends can pay you back.</li>
        </ul>
        <h2 class="h2">Money</h2>
        <p>Payments go straight from one wallet to another on Stellar. Quits never holds money. Like any blockchain payment, they are public.</p>
        <h2 class="h2">Photos</h2>
        <p>Photos of the place and of the receipt are read by Claude, from Anthropic, to get the venue name and the lines of the bill. Anthropic doesn’t train its models on them.</p>
        <h2 class="h2">Sharing</h2>
        <p>Whoever has a night’s link can see that night: its name, photos and who was there, but not handles or amounts. No ads, no trackers, nothing sold.</p>
        <h2 class="h2">Leaving</h2>
        <p>You can delete your account from your profile. Nights you shared stay with the others who were there.</p>
      </div>
    </section>`);
  },
  act: { back() { history.length > 1 ? history.back() : nav('/'); } },
};

/* ---------- home: your nights ---------- */
function friendsFromNights() {
  const map = new Map();
  nights().forEach(n => (n.people || []).forEach(p => { const k = (p.name || '').toLowerCase(); if (!k) return; const f = map.get(k) || { name: p.name, color: p.color, contact: p.contact, nights: 0, last: n.name, at: n.at }; f.nights++; if (n.at >= f.at) { f.last = n.name; f.at = n.at; if (p.contact) f.contact = p.contact; } map.set(k, f); }));
  return [...map.values()].sort((a, b) => b.nights - a.nights || b.at - a.at);
}
function stubHTML(n) {
  const img = n.coverId ? `<img class="stub-img" src="${imgUrl(n.code, n.coverId)}" alt="" loading="lazy">` : '<div class="stub-img nocover"></div>';
  const dots = (n.people || []).slice(0, 5).map(p => `<i style="--c:${esc(p.color)}"></i>`).join('');
  const st = n.phase === 'settled' ? `${ic('check', 12)}settled` : n.phase === 'settling' ? 'paying back' : 'open';
  return `<li class="stub" data-act="night" data-code="${esc(n.code)}" role="button" tabindex="0">${img}<div class="stub-main"><b class="stub-name">${esc(n.name)}</b><span class="stub-meta">${dayLabel(n.at)} · ${n.role === 'host' ? 'you paid' : 'you were there'}</span><span class="stub-who">${dots}<span>${n.n} ${n.n === 1 ? 'person' : 'people'}</span></span></div><div class="stub-amt"><span class="mono">${n.total ? money(n.total, n.currency) : ''}</span><span class="stub-st">${st}</span></div></li>`;
}
SCREENS.home = {
  render() {
    const list = nights(), fr = friendsFromNights();
    return h(`<section>
      <header class="scr-head"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span><span class="grow"></span>${netPill()}<button class="me-btn" type="button" data-act="me" aria-label="Your profile">${meAvatar(34)}</button></header>
      <div class="scr-body">
        <h1 class="t-xl home-title">Your nights</h1>
        <p class="sub">Every table you’ve split, kept with the people who were there.</p>
        ${list.length ? `<div class="stats"><div><b>${list.length}</b><span>${list.length === 1 ? 'night' : 'nights'}</span></div><button type="button" data-act="friends"><b>${fr.length}</b><span>${fr.length === 1 ? 'friend' : 'friends'} ›</span></button><div><b>${list.filter(n => n.role === 'host').length}</b><span>you paid</span></div></div>
        <ol class="stubs">${list.map(stubHTML).join('')}</ol>`
        : `<div class="empty"><b>No nights yet</b>Open a table the next time you’re out with friends and pay the bill, or scan a friend’s QR to join theirs.</div>`}
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="new">${ic('plus')}Open a table</button><p class="foot-note">Snap the place, share the QR, everyone pays their part.</p></footer>
    </section>`);
  },
  enter(ctx) {
    const el = ctx.el;
    gsap.from($('.wm-hl', el), { scaleX: 0, duration: D(.7), ease: 'power3.out', delay: .1 });
    if (!RM && !ctx.opts.synced) gsap.from($$('.stats > *, .stub, .empty', el), { y: 22, opacity: 0, duration: .5, stagger: .06, ease: 'power3.out', delay: .1 });
    if (signedIn() && !ctx.opts.synced) syncNights(ctx);
  },
  act: {
    new() { nav(openTablePath()); },
    me() { nav('/me'); },
    friends() { nav('/friends'); },
    night(ctx, b) { nav('/t/' + b.dataset.code); },
  },
};
// Nights kept in the account but not on this phone yet (a new phone, or another browser).
async function syncNights(ctx) {
  await loadMe();
  if (!USER || ctx.dead) return;
  const have = new Set(nights().map(n => n.code));
  const missing = (USER.nights || []).filter(n => !have.has(n.code)).slice(0, 12);
  let added = 0;
  for (const n of missing) {
    try { const j = await api(`/t/${n.code}/state`); if (j.s && j.me) { rememberNight(j.s, j.me); LS.set('t:' + n.code, { pid: j.me, token: (credsFor(n.code) || {}).token || '' }); added++; } } catch (e) { /* gone */ }
  }
  if (added && !ctx.dead && UI.cur && UI.cur.name === 'home') UI.go('home', { dir: 'none', synced: true });
}
function netPill() { return HEALTH.network === 'public' ? '' : '<span class="netpill test" title="Payments use Stellar testnet, no real money">testnet</span>'; }

/* ---------- new table: snap the place, then the details ---------- */
SCREENS.snap = {
  render() {
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back">${ic('back', 22)}</button><span class="head-t">New table</span></header>
      <div class="scr-body snap-body">
        <div class="vf"><img class="vf-img" alt="" hidden><div class="vf-empty"><span>${ic('camera', 30)}</span><b>Snap the place</b><span>A photo of the sign or the group. It becomes the cover of the night.</span></div><i class="vf-c tl"></i><i class="vf-c tr"></i><i class="vf-c bl"></i><i class="vf-c br"></i><div class="vf-flash"></div></div>
        <div class="snap-ctrl">
          <label class="pick" for="pick-cover" title="Choose a photo">${ic('image', 22)}<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Choose a photo</span></label>
          <input id="pick-cover" class="cap-in" type="file" accept="image/*">
          <button class="shutter" type="button" data-act="shoot" aria-label="Take the photo"><span></span></button>
          <input id="cam-cover" class="cap-in" type="file" accept="image/*" capture="environment">
          <button class="pick" type="button" data-act="skip" title="No photo">${ic('chev', 22)}<span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Skip the photo</span></button>
        </div>
        <form class="details form" hidden autocomplete="off">
          <span class="read-chip" hidden>${ic('sparkle', 14)}<span class="rc-txt">Reading the sign…</span></span>
          <div class="field"><label class="label" for="ev-name">Name of the night</label><input id="ev-name" class="name-in" type="text" spellcheck="false" placeholder="Where are you?" maxlength="40"></div>
          <div class="field"><label class="label" for="host-name">Your name</label><input id="host-name" class="in" type="text" maxlength="18" value="${esc(PROFILE.name)}" placeholder="What your friends call you"></div>
          <div class="field"><label class="label" for="host-addr">Your Stellar address</label>
            <div class="in-row"><input id="host-addr" class="in mono" type="text" spellcheck="false" autocapitalize="characters" placeholder="G…" value="${esc(PROFILE.address)}"><button class="mini-btn" type="button" data-act="paste">Paste</button></div>
            <span class="helper">Everyone pays you back here, straight from their wallet. Copy it from Decaf, LOBSTR, Freighter or any Stellar wallet.</span>
            <button class="btn ghost sm" type="button" data-act="wallet" style="align-self:flex-start">${ic('wallet', 18)}Use my wallet</button></div>
          <p class="helper">Friends pay you back in USDC, the digital dollar by Circle, at today’s euro rate.</p>
          <p class="form-err" hidden></p>
        </form>
      </div>
      <footer class="scr-foot" hidden><button class="btn primary" type="button" data-act="open">Open the table${ic('chev')}</button></footer>
    </section>`);
  },
  enter(ctx) {
    const el = ctx.el;
    gsap.from($$('.vf-c', el), { scale: 1.6, opacity: 0, duration: D(.5), stagger: .05, ease: 'power2.out', delay: .15 });
    ['#pick-cover', '#cam-cover'].forEach(sel => $(sel, el).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) compress(f).then(src => shootPlace(ctx, src)).catch(err => UI.toast(`<div><b>${esc(err.message)}</b></div>`)); }));
  },
  act: {
    back(ctx) { nav('/', { dir: 'back' }); },
    shoot(ctx) { $('#cam-cover', ctx.el).click(); },
    skip(ctx) { if (!ctx.shot) shootPlace(ctx, null); },
    async paste(ctx) { try { const t = (await navigator.clipboard.readText()).trim(); if (t) $('#host-addr', ctx.el).value = t; } catch (e) { $('#host-addr', ctx.el).focus(); } },
    async wallet(ctx, b) {
      busy(b, true, 'Connecting');
      try { const w = await import('./wallet.js'); const { address } = await w.connect(HEALTH); $('#host-addr', ctx.el).value = address; }
      catch (e) { UI.toast(`<div><b>Couldn’t connect a wallet</b><small>${esc(e.message || 'Paste your address instead.')}</small></div>`, 3600); }
      busy(b, false);
    },
    acc(ctx, b) { const on = b.getAttribute('aria-checked') !== 'true'; const others = $$('[data-act=acc]', ctx.el).filter(x => x !== b && x.getAttribute('aria-checked') === 'true'); if (!on && !others.length) return; b.setAttribute('aria-checked', String(on)); },
    async open(ctx, b) {
      const el = ctx.el, errEl = $('.form-err', el);
      const name = $('#ev-name', el).value.trim(), hostName = $('#host-name', el).value.trim(), address = $('#host-addr', el).value.trim().toUpperCase();
      const accept = ACCEPT;
      errEl.hidden = true;
      if (!hostName) { errEl.textContent = 'Add your name so friends know whose table this is.'; errEl.hidden = false; $('#host-name', el).focus(); return; }
      if (!/^G[A-Z2-7]{55}$/.test(address)) { errEl.textContent = 'Paste your Stellar address. It starts with G and has 56 characters.'; errEl.hidden = false; $('#host-addr', el).focus(); return; }
      busy(b, true, 'Opening the table');
      try {
        const j = await api('/tables', { name: name || 'Tonight', hostName, color: PROFILE.color || '#FFE45C', address, accept, cover: ctx.coverData || null, contact: PROFILE.contact });
        Object.assign(PROFILE, { name: hostName, address, accept }); saveProfile();
        pushProfile({ name: hostName, address, accept });
        LS.set('t:' + j.code, { pid: j.pid, token: j.token });
        nav('/t/' + j.code);
      } catch (e) {
        if (e.need === 'invite') { if (!accounts()) LS.set('invite', ''); nav('/invite?next=new'); return; }
        if (e.need === 'login') { signOutLocal(); nav('/'); return; }
        errEl.textContent = e.message; errEl.hidden = false; busy(b, false);
      }
    },
  },
};
function shootPlace(ctx, src) {
  if (ctx.shot && !src) return;
  ctx.shot = true; ctx.coverData = src;
  const el = ctx.el, vf = $('.vf', el), img = $('.vf-img', vf);
  vf.style.height = vf.offsetHeight + 'px'; vf.style.aspectRatio = 'auto';
  const tl = gsap.timeline();
  if (src) {
    img.src = src; img.hidden = false;
    tl.to($('.vf-flash', vf), { opacity: 1, duration: D(.07) })
      .add(() => { $('.vf-empty', vf).hidden = true; })
      .set(img, { filter: 'brightness(2.6) contrast(0.45) saturate(0) blur(10px)' })
      .to($('.vf-flash', vf), { opacity: 0, duration: D(.55) })
      .to(img, { filter: 'brightness(1) contrast(1) saturate(1) blur(0px)', duration: D(1.6), ease: 'power2.out' }, '<.05');
  }
  tl.to($$('.vf-c', vf), { opacity: 0, duration: D(.25) }, 0)
    .to($('.snap-ctrl', el), { opacity: 0, height: 0, duration: D(.35), ease: 'power2.inOut' }, 0)
    .to(vf, { height: src ? 230 : 120, duration: D(.7), ease: 'power3.inOut' }, src ? '-=.9' : 0)
    .add(() => revealDetails(ctx));
}
async function revealDetails(ctx) {
  if (ctx.dead) return;
  const el = ctx.el, det = $('.details', el), foot = $('.scr-foot', el), inp = $('#ev-name', el), chip = $('.read-chip', el);
  $('.snap-ctrl', el).style.display = 'none'; det.hidden = false; foot.hidden = false;
  if (!RM) { gsap.from(det.children, { y: 22, opacity: 0, duration: .5, stagger: .06, ease: 'power3.out' }); gsap.from(foot, { y: 30, opacity: 0, duration: .5, ease: 'power3.out', delay: .25 }); }
  if (!ctx.coverData) { inp.focus(); return; }
  chip.hidden = false;
  try {
    const small = await shrink(ctx.coverData, 1024);
    const r = await api('/sign', { image: small });
    if (ctx.dead) return;
    if (!r.name) { $('.rc-txt', chip).textContent = 'Name it yourself'; inp.focus(); return; }
    if (inp.value.trim()) return;
    let i = 0;
    const step = () => { if (ctx.dead) return; inp.value = r.name.slice(0, ++i); if (i < r.name.length) later(45 + Math.random() * 40, step); else { $('.rc-txt', chip).textContent = 'Read from your photo'; gsap.fromTo(chip, { scale: .88 }, { scale: 1, duration: .45, ease: 'back.out(3)' }); } };
    step();
  } catch (e) { $('.rc-txt', chip).textContent = 'Name it yourself'; }
}

/* ---------- host: the table QR ---------- */
SCREENS.invite = {
  render() {
    return h(`<section>
      <header class="scr-head">${evMini('<i class="live-dot"></i>Table open')}<span class="grow"></span>${netPill()}</header>
      <div class="scr-body invite-body">
        <div class="ring-slot"></div>
        <div class="join-count"><b class="jc">1</b>at the table</div>
        <p class="sub center" style="max-width:31ch;margin-top:0">Put your phone in the middle. Friends scan the QR with their camera; it opens in the browser, no app.</p>
        <button class="linkchip" type="button" data-act="share">${ic('link', 15)}<span>${esc(location.host)}/t/${esc(S.code)}</span></button>
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="scan">${ic('receipt')}Scan the receipt</button></footer>
    </section>`);
  },
  enter(ctx) {
    const ring = TableRing({ size: 330, tableR: 98, seatR: 21, gap: 28, empty: true });
    $('.ring-slot', ctx.el).appendChild(ring.el); ctx.ring = ring;
    ring.center(`${ringText(`SCAN TO JOIN · ${S.code} · SCAN TO JOIN · ${S.code} · `)}<div class="ring-qr">${qrSVG(tableUrl(S.code))}</div>`);
    ring.set(S.order, false);
    setNum($('.jc', ctx.el), S.order.length, String);
    const mods = $$('.ring-qr .qm', ring.el);
    if (!RM && !ctx.opts.quiet) {
      gsap.from(mods, { scale: 0, opacity: 0, transformOrigin: '50% 50%', duration: .5, ease: 'back.out(2)', delay: i => .15 + Number(mods[i].dataset.d) * .7 });
      gsap.from(ring.el.querySelector('.ring-table'), { scale: .6, opacity: 0, duration: .7, ease: 'back.out(1.6)' });
    }
    if (!RM) { const rot = gsap.to($('.ring-text', ring.el), { rotation: 360, transformOrigin: '50% 50%', duration: 48, repeat: -1, ease: 'none' }); ctx.bag.push(() => rot.kill()); }
    on('join', d => { ring.set(S.order, true); roll($('.jc', ctx.el), S.order.length, String, .5); UI.toast(`${av(d.pid, 30)}<div><b>${esc(P(d.pid).name)} joined</b><small>${S.order.length} at the table</small></div>`, 2200); }, ctx.bag);
  },
  act: {
    async share(ctx, b) {
      const url = tableUrl(S.code);
      if (navigator.share) { try { await navigator.share({ title: S.name, text: `Join our table at ${S.name}`, url }); return; } catch (e) { /* cancelled */ } }
      copyText(url, b);
    },
    async scan(ctx, b) { busy(b, true); try { await act('scan'); } catch (e) { busy(b, false); } },
  },
};

/* ---------- host: scan, check and send the receipt ---------- */
const DRAFT_KEY = () => 'draft:' + S.code;
SCREENS.receipt = {
  render() {
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back">${ic('back', 22)}</button><span class="head-t">The receipt</span><span class="grow"></span><span class="chip">${ic('users', 15)}<span class="hc">${S.order.length}</span> at the table</span></header>
      <div class="scr-body rc-body"></div>
      <footer class="scr-foot"></footer>
    </section>`);
  },
  enter(ctx) {
    on('join', () => { const e = $('.hc', ctx.el); if (e) e.textContent = S.order.length; }, ctx.bag);
    const d = LS.get(DRAFT_KEY(), null);
    if (d && d.lines && d.lines.length) { ctx.draft = d; showReview(ctx, false); } else showChoose(ctx);
  },
  act: {
    async back(ctx) { if (ctx.stage === 'review' || ctx.stage === 'reading') { LS.set(DRAFT_KEY(), null); showChoose(ctx); return; } try { await act('unscan'); } catch (e) { /* stays */ } },
    shoot(ctx) { $('#cam-rc', ctx.el).click(); },
    type(ctx) { ctx.draft = { lines: [], printedTotal: null, imageId: null, currency: 'EUR', tip: 0 }; showReview(ctx, false); openLineSheet(ctx, -1); },
    tip(ctx, b) { $$('[data-act=tip]', ctx.el).forEach(x => x.setAttribute('aria-checked', String(x === b))); ctx.draft.tip = Number(b.dataset.tip); saveDraft(ctx); },
    async send(ctx, b) {
      if (!ctx.draft.lines.length) { UI.toast('<div><b>Add at least one line</b></div>'); return; }
      busy(b, true, 'Sending');
      try {
        await act('publish', { lines: ctx.draft.lines, tip: ctx.draft.tip || 0, imageId: ctx.draft.imageId, printedTotal: ctx.draft.printedTotal, currency: ctx.draft.currency });
        LS.set(DRAFT_KEY(), null);
      } catch (e) { busy(b, false); }
    },
  },
};
function saveDraft(ctx) { LS.set(DRAFT_KEY(), ctx.draft); }
function showChoose(ctx) {
  ctx.stage = 'choose';
  const body = $('.rc-body', ctx.el), foot = $('.scr-foot', ctx.el);
  body.innerHTML = `<div class="vf" style="aspect-ratio:3/4"><div class="vf-empty"><span>${ic('receipt', 30)}</span><b>Snap the receipt</b><span>Flat, in good light, the whole thing in frame. Quits reads every line.</span></div><i class="vf-c tl"></i><i class="vf-c tr"></i><i class="vf-c bl"></i><i class="vf-c br"></i></div>
    <input id="cam-rc" class="cap-in" type="file" accept="image/*" capture="environment"><input id="pick-rc" class="cap-in" type="file" accept="image/*">`;
  foot.innerHTML = `<div class="shutter-wrap"><button class="shutter" type="button" data-act="shoot" aria-label="Take a photo of the receipt"><span></span></button></div><div class="row2"><label class="btn ghost sm" for="pick-rc">${ic('image', 18)}From photos</label><button class="btn ghost sm" type="button" data-act="type">${ic('edit', 18)}Type it</button></div>`;
  ['#cam-rc', '#pick-rc'].forEach(sel => $(sel, ctx.el).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readReceiptPhoto(ctx, f); }));
}
async function readReceiptPhoto(ctx, file) {
  ctx.stage = 'reading';
  const body = $('.rc-body', ctx.el), foot = $('.scr-foot', ctx.el);
  let data;
  try { data = await compress(file, 1600, 0.85); } catch (e) { UI.toast(`<div><b>${esc(e.message)}</b></div>`); showChoose(ctx); return; }
  body.innerHTML = `<div class="photo-scan"><img src="${data}" alt="Your receipt"><div class="scanline"></div><div class="ps-msg"><span class="spin"></span><span>Reading the receipt…</span></div></div>`;
  foot.innerHTML = '';
  const line = $('.scanline', body);
  const sweep = RM ? null : gsap.fromTo(line, { top: '4%' }, { top: '96%', duration: 1.4, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  try {
    const r = await api(`/t/${S.code}/receipt`, { image: data }, ME);
    if (sweep) sweep.kill();
    if (ctx.dead) return;
    if (!r.readable) { body.innerHTML = `<div class="empty"><b>Couldn’t read that one</b>Try again flat and in better light, or type the lines yourself.</div>`; foot.innerHTML = `<div class="choice"><button class="btn primary" type="button" data-act="shoot">${ic('camera')}Try another photo</button><button class="btn ghost" type="button" data-act="type">Type the lines</button></div><input id="cam-rc" class="cap-in" type="file" accept="image/*" capture="environment">`; $('#cam-rc', ctx.el).addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) readReceiptPhoto(ctx, f); }); return; }
    ctx.draft = { lines: r.lines.map((l, i) => ({ ...l, id: 'd' + i })), printedTotal: r.total || null, imageId: r.imageId, currency: r.currency === 'USD' ? 'USD' : 'EUR', tip: 0 };
    saveDraft(ctx);
    showReview(ctx, true);
  } catch (e) {
    if (sweep) sweep.kill();
    body.innerHTML = `<div class="empty"><b>The reader didn’t answer</b>${esc(e.message)}</div>`;
    foot.innerHTML = `<div class="choice"><button class="btn ghost" type="button" data-act="type">Type the lines</button></div>`;
  }
}
function showReview(ctx, animate) {
  ctx.stage = 'review';
  const body = $('.rc-body', ctx.el), foot = $('.scr-foot', ctx.el), d = ctx.draft;
  S.currency = d.currency || 'EUR';
  const sum = d.lines.reduce((a, l) => a + l.total, 0);
  const match = d.printedTotal ? Math.abs(d.printedTotal - sum) < 2 : null;
  body.innerHTML = `<div class="check ${match === false ? 'warn' : 'ok'}">${ic(match === false ? 'close' : 'check', 16)}<span>${d.lines.length} lines · ${match === null ? `total <b>${money(sum)}</b>` : match ? `total matches the receipt: <b>${money(sum)}</b>` : `lines add up to <b>${money(sum)}</b>, the receipt says <b>${money(d.printedTotal)}</b>. Tap a line to fix it.`}</span></div>
    <div class="printer"><div class="printer-slot"></div><div class="print-wrap"></div></div>
    <div class="field"><span class="label" id="tip-l">Tip on top</span><div class="seg small" role="radiogroup" aria-labelledby="tip-l">${[0, 5, 10].map(t => `<button type="button" role="radio" aria-checked="${(d.tip || 0) === t}" data-act="tip" data-tip="${t}">${t ? t + '%' : 'None'}</button>`).join('')}</div><p class="foot-note" style="text-align:left">Each person adds the same share of the tip to what they had.</p></div>`;
  const rec = Receipt({ mode: 'review', draft: d.lines });
  const wrap = $('.print-wrap', body); wrap.appendChild(rec.el);
  rec.el.addEventListener('click', e => { if (e.target.closest('[data-rv=add]')) { openLineSheet(ctx, -1); return; } const le = e.target.closest('.rc-line'); if (le) openLineSheet(ctx, Number(le.dataset.i)); });
  foot.innerHTML = `<button class="btn primary" type="button" data-act="send">Send to the table${ic('chev')}</button>`;
  if (animate && !RM) { const full = rec.el.offsetHeight; wrap.style.height = '0px'; gsap.to(wrap, { height: full, duration: 2.1, ease: 'steps(28)', onComplete: () => { wrap.style.height = ''; } }); gsap.from($('.check', body), { y: 14, opacity: 0, duration: .45, delay: 2.1 }); }
}
function openLineSheet(ctx, i) {
  const d = ctx.draft, l = i >= 0 ? d.lines[i] : { qty: 1, name: '', total: 0, kind: 'dish', en: '' };
  const sh = h(`<div class="sheet-wrap"><div class="sheet-dim"></div><div class="sheet" role="dialog" aria-label="${i >= 0 ? 'Edit line' : 'Add a line'}">
    <div class="grab"></div><b class="t-l">${i >= 0 ? 'Edit line' : 'Add a line'}</b>
    <form class="form" autocomplete="off">
      <div class="field"><label class="label" for="ln-name">Item</label><input id="ln-name" class="in" type="text" maxlength="48" value="${esc(l.name)}" placeholder="As on the receipt"></div>
      <div class="row2"><div class="field"><span class="label">How many</span><div class="qty-step"><button type="button" data-q="-1" aria-label="One less">−</button><b class="lq">${l.qty}</b><button type="button" data-q="1" aria-label="One more">+</button></div></div>
        <div class="field"><label class="label" for="ln-total">Line total</label><input id="ln-total" class="in" type="text" inputmode="decimal" value="${l.total ? (l.total / 100).toFixed(2) : ''}" placeholder="0.00"></div></div>
      <label class="toggle" for="ln-shared"><input id="ln-shared" type="checkbox" ${l.kind === 'shared' ? 'checked' : ''}><span class="tg-ui" aria-hidden="true"></span><span><b>Shared by the table</b><small>Like a bottle or a plate for two: split between whoever had some.</small></span></label>
      <div class="row2">${i >= 0 ? `<button class="btn ghost danger" type="button" data-ln="del">${ic('trash', 18)}Remove</button>` : ''}<button class="btn primary" type="submit">${i >= 0 ? 'Save' : 'Add'}</button></div>
    </form></div></div>`);
  ctx.el.appendChild(sh);
  gsap.from($('.sheet-dim', sh), { opacity: 0, duration: D(.25) }); gsap.from($('.sheet', sh), { yPercent: 110, duration: D(.45), ease: 'power3.out' });
  let qty = l.qty;
  const close = () => gsap.to($('.sheet', sh), { yPercent: 110, duration: D(.3), ease: 'power2.in', onComplete: () => sh.remove() });
  sh.addEventListener('click', e => {
    const q = e.target.closest('[data-q]'); if (q) { qty = Math.max(1, Math.min(99, qty + Number(q.dataset.q))); $('.lq', sh).textContent = qty; return; }
    if (e.target.closest('[data-ln=del]')) { d.lines.splice(i, 1); saveDraft(ctx); close(); showReview(ctx, false); return; }
    if (e.target.classList.contains('sheet-dim')) close();
  });
  $('form', sh).addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#ln-name', sh).value.trim(), total = Math.round(Number($('#ln-total', sh).value.replace(',', '.')) * 100);
    if (!name || !(total > 0)) { shake($('.sheet', sh)); return; }
    const shared = $('#ln-shared', sh).checked;
    const nl = { ...l, id: l.id || 'd' + Date.now(), qty, name, total, kind: shared ? 'shared' : qty > 1 ? 'each' : 'dish' };
    if (i >= 0) d.lines[i] = nl; else d.lines.push(nl);
    saveDraft(ctx); close(); showReview(ctx, false);
  });
  later(350, () => { if (i < 0) $('#ln-name', sh).focus(); });
}

/* ---------- claiming (guests, and the host in “My part”) ---------- */
function claimView(ctx, host) {
  const wrap = h(`<div class="claimv"><div class="claim-top"><span class="left-chip"><span class="lc-t">Left to claim</span><b class="lc-v">€0.00</b></span><span class="grow"></span><span class="here"><span class="avs"></span></span></div><div class="rc-slot" style="margin-top:12px"></div></div>`);
  let rec = null, shown = '';
  const mount = () => {
    shown = JSON.stringify(S.receipt);
    rec = Receipt({ mode: 'claim' });
    rec.el.addEventListener('click', onLineTap);
    rec.el.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('rc-line')) { e.preventDefault(); onLineTap(e); } });
    $('.rc-slot', wrap).replaceChildren(rec.el); rec.paintAll(false);
  };
  mount();
  const avs = () => { $('.avs', wrap).innerHTML = S.order.map(id => av(id, 24)).join(''); };
  avs();
  on('claims', d => { if (d.lid) rec.paint(d.lid, true); else rec.paintAll(false); }, ctx.bag);
  on('leftover', () => rec.paintAll(true), ctx.bag);
  on('join', () => { avs(); rec.paintAll(false); }, ctx.bag);
  on('receipt', () => { if (S.receipt && JSON.stringify(S.receipt) !== shown) mount(); }, ctx.bag);
  return { el: wrap, left() { const s = shares(S); const lc = $('.lc-v', wrap); roll(lc, s.unclaimed); $('.lc-t', wrap).textContent = S.leftover ? 'Leftovers split' : 'Left to claim'; } };
}
async function onLineTap(e) {
  const le = e.target.closest('.rc-line'); if (!le || !S) return;
  const lid = le.dataset.id, l = lines(S).find(x => x.id === lid), me = ME.pid; if (!l) return;
  const mine = (S.claims[lid] || {})[me] || 0;
  if (S.phase !== 'claiming') { shake(le); UI.toast(`${ic('lock', 18)}<div><b>The receipt is closed</b><small>Everyone has finished claiming.</small></div>`, 2200); return; }
  const st = e.target.closest('[data-d]');
  let delta = st ? Number(st.dataset.d) : mine > 0 ? -mine : 1;
  if (delta > 0 && l.kind === 'each' && unitsClaimed(S, lid) >= l.qty) { shake(le); UI.toast(`<div><b>All ${l.qty} are claimed</b><small>Ask the table who has an extra one.</small></div>`, 2200); return; }
  // optimistic: show it now, the server confirms a moment later
  const ns = JSON.parse(JSON.stringify(S)), c = ns.claims[lid] || (ns.claims[lid] = {});
  if (l.kind === 'each') c[me] = Math.max(0, Math.min(l.qty, mine + delta)); else c[me] = delta > 0 ? 1 : 0;
  if (!c[me]) delete c[me];
  ns.ready = ns.ready.filter(x => x !== me);
  applyState(ns);
  act('claim', { lid, delta }).catch(() => {});
}
function partFoot(ctx, host) {
  const el = h(`<div class="sheet-foot"><div class="yp"><span class="label">${host ? 'Your part (you paid)' : 'Your part'}</span><b class="yp-v">€0.00</b><span class="yp-s">Tap a line to add it</span></div><button class="btn primary" type="button" data-act="done" disabled>I’m done</button></div>`);
  const upd = (animate = true) => {
    if (ctx.dead || !S) return;
    const s = shares(S), me = ME.pid, mt = s.total[me] || 0, n = lines(S).filter(l => (S.claims[l.id] || {})[me]).length;
    const v = $('.yp-v', el); if (animate) roll(v, mt); else setNum(v, mt);
    const bits = []; if (n) bits.push(`${n} thing${n === 1 ? '' : 's'}`); if (s.leftShare[me]) bits.push(`${eur(s.leftShare[me])} leftovers`); if (s.tip[me]) bits.push(`${eur(s.tip[me])} tip`);
    $('.yp-s', el).textContent = bits.length ? bits.join(' · ') : 'Tap a line to add it';
    const b = $('.btn', el);
    if (S.phase === 'settling' && !host && gameFree(S, me)) { b.disabled = true; b.dataset.act = 'done'; b.textContent = `${P(S.game.outcome.loser).name} pays`; }
    else if (S.phase === 'settling' && !host) { b.disabled = !!(S.paid[me]); b.dataset.act = 'pay'; b.textContent = S.paid[me] ? 'Paid' : 'Pay ' + P(S.host).name; }
    else if (S.phase !== 'claiming') { b.disabled = true; b.dataset.act = 'done'; b.textContent = host ? 'All set' : 'Closed'; }
    else if (S.ready.includes(me)) { const r = S.order.filter(id => S.ready.includes(id)).length; b.disabled = false; b.dataset.act = 'done'; b.textContent = `Waiting · ${r}/${S.order.length}`; }
    else { b.disabled = n === 0 && !host; b.dataset.act = 'done'; b.textContent = 'I’m done'; }
  };
  ['claims', 'ready', 'phase', 'leftover', 'join', 'paid', 'game'].forEach(t => on(t, () => upd(), ctx.bag));
  upd(false);
  return el;
}

/* ---------- guest: wait for the receipt ---------- */
SCREENS.wait = {
  render() {
    return h(`<section>
      <header class="scr-head"><span class="urlbar">${ic('lock', 13)}${esc(location.host)}/t/${esc(S.code)}</span></header>
      <div class="scr-body wait-body">
        <h1 class="t-xl" style="margin-top:8px">You’re at the table</h1>
        <p class="sub ws" style="margin-top:0"></p>
        <div class="ring-slot"></div>
        <div class="wait-line"><span class="shimmer"></span><span class="wl-t"></span></div>
      </div>
    </section>`);
  },
  enter(ctx) {
    const ring = TableRing({ size: 320, tableR: 90, seatR: 20, gap: 30 });
    $('.ring-slot', ctx.el).appendChild(ring.el); ctx.ring = ring;
    ring.center(cover(S) ? `<img class="ring-photo" src="${cover(S)}" alt="">` : `<b class="tk-code">${esc(S.code)}</b>`);
    ring.set(S.order, false);
    const txt = () => { $('.ws', ctx.el).textContent = `${S.name} · ${S.order.length} people`; $('.wl-t', ctx.el).textContent = S.phase === 'scanning' ? `${P(S.host).name} is scanning the receipt…` : `Waiting for ${P(S.host).name} to scan the receipt`; };
    txt();
    if (!RM) gsap.from(ring.el.querySelector('.ring-table'), { scale: .7, opacity: 0, duration: .7, ease: 'back.out(1.6)' });
    on('join', () => { ring.set(S.order, true); txt(); }, ctx.bag);
    on('phase', txt, ctx.bag);
  },
};

/* ---------- guest: claim ---------- */
SCREENS.claim = {
  render() {
    return h(`<section>
      <header class="scr-head claim-head"><h1 class="t-xl">What did you have?</h1><p class="sub" style="margin-top:4px">Tap your things. The whole table sees what you tap.</p></header>
      <div class="scr-body claim-body"></div>
      <footer class="scr-foot"></footer>
    </section>`);
  },
  enter(ctx) {
    const cv = claimView(ctx, false); $('.claim-body', ctx.el).appendChild(cv.el); cv.left(); ctx.cv = cv;
    $('.scr-foot', ctx.el).appendChild(partFoot(ctx, false));
    ['claims', 'leftover', 'phase'].forEach(t => on(t, () => cv.left(), ctx.bag));
    on('leftover', d => UI.toast(`${ic('users', 20)}<div><b>Leftovers split between everyone</b><small>Nobody claimed ${eur(d.cents)}, so it’s shared</small></div>`), ctx.bag);
    if (!RM && !ctx.opts.quiet) gsap.from($('.rcpt', ctx.el), { y: 80, opacity: 0, rotation: 2, duration: .7, ease: 'power3.out', delay: .1 });
  },
  act: {
    done(ctx) { if (S.phase === 'claiming') act('ready', { v: !S.ready.includes(ME.pid) }).catch(() => {}); },
    pay() { UI.go('pay'); },
  },
};

/* ---------- host: the live table ---------- */
SCREENS.live = {
  render(ctx) {
    ctx.tab = ctx.opts.tab || (S.phase === 'claiming' && !S.ready.includes(ME.pid) ? 'mine' : 'table');
    return h(`<section>
      <header class="scr-head">${evMini(`<i class="live-dot"></i><span class="lv-st"></span>`)}<span class="grow"></span><div class="tabs" role="tablist"><button type="button" role="tab" data-act="tab" data-tab="table" aria-selected="${ctx.tab === 'table'}">Table</button><button type="button" role="tab" data-act="tab" data-tab="mine" aria-selected="${ctx.tab === 'mine'}">My part</button></div></header>
      <div class="scr-body live-body"></div>
      <footer class="scr-foot"></footer>
    </section>`);
  },
  enter(ctx) {
    renderLiveTab(ctx);
    const status = () => { const e = $('.lv-st', ctx.el); if (e) e.textContent = { claiming: 'Claiming', settling: 'Paying back', settled: 'Settled' }[S.phase] || 'Live'; };
    status();
    on('phase', () => { status(); if (S.phase === 'settled') later(500, () => quitsMoment(ctx)); else if (S.phase === 'settling' && ctx.tab === 'mine') { ctx.tab = 'table'; $$('[data-act=tab]', ctx.el).forEach(x => x.setAttribute('aria-selected', String(x.dataset.tab === 'table'))); renderLiveTab(ctx); } }, ctx.bag);
    on('paid', d => livePaid(ctx, d), ctx.bag);
    if (S.phase === 'settled' && !ctx.opts.noMoment) later(400, () => quitsMoment(ctx));
  },
  act: {
    tab(ctx, b) { if (ctx.tab === b.dataset.tab) return; ctx.tab = b.dataset.tab; $$('[data-act=tab]', ctx.el).forEach(x => x.setAttribute('aria-selected', String(x === b))); renderLiveTab(ctx); },
    confirm(ctx, b) { act('confirmCash', { who: b.closest('.prow').dataset.id }).catch(() => {}); },
    async close(ctx, b) { busy(b, true); try { await act('close'); } catch (e) { busy(b, false); } },
    async round(ctx, b) { busy(b, true); try { await act('gameAsk'); } catch (e) { /* toasted */ } busy(b, false); },
    done() { if (S.phase === 'claiming') act('ready', { v: !S.ready.includes(ME.pid) }).catch(() => {}); },
    night() { nav(`/t/${S.code}?night`); },
  },
};
function renderLiveTab(ctx) {
  const body = $('.live-body', ctx.el), foot = $('.scr-foot', ctx.el);
  (ctx.tabBag || []).forEach(f => f()); ctx.tabBag = [];
  const sub = { bag: ctx.tabBag, get dead() { return ctx.dead; } };
  body.replaceChildren(); foot.replaceChildren();
  if (ctx.tab === 'mine') {
    body.classList.add('claim-body');
    body.appendChild(h(`<p class="sub" style="margin:0 0 4px">Tap what you had too. Your part stays with you; the rest comes back to you.</p>`));
    const cv = claimView(sub, true); body.appendChild(cv.el); cv.left();
    ['claims', 'leftover', 'phase'].forEach(t => on(t, () => cv.left(), sub.bag));
    foot.appendChild(partFoot(sub, true));
    return;
  }
  body.classList.remove('claim-body');
  const ring = TableRing({ size: 320, tableR: 92, seatR: 20, gap: 30 });
  body.appendChild(ring.el); ctx.ring = ring; ring.set(S.order, false);
  ring.center(`<div class="ring-tot"><span class="label">back to you</span><b class="rt-v">${eur(0)}</b><span class="rt-of"></span></div>`);
  body.appendChild(h(`<div class="left-banner" hidden><span class="stripes"></span><span class="lb-t"></span></div>`));
  body.appendChild(h(`<ul class="plist"></ul>`));
  foot.appendChild(h(`<div class="host-actions"></div>`));
  liveRows(ctx); refreshLive(ctx, false);
  ['claims', 'ready', 'paid', 'phase', 'leftover', 'intents'].forEach(t => on(t, () => refreshLive(ctx), sub.bag));
  on('join', () => { ring.set(S.order, true); liveRows(ctx); refreshLive(ctx); }, sub.bag);
}
function liveRows(ctx) {
  const ul = $('.plist', ctx.el); if (!ul) return;
  ul.innerHTML = S.order.map(id => `<li class="prow" data-id="${esc(id)}">${av(id, 34)}<div class="pr-main"><b>${id === ME.pid ? 'You' : esc(P(id).name)}</b><span class="pr-sub"></span></div><span class="pr-amt mono"></span><span class="pr-st"></span></li>`).join('');
  $$('.pr-amt', ul).forEach(e => { e._v = 0; });
}
function personState(id) {
  const p = S.paid[id];
  if (id === S.host) return 'host';
  if (gameFree(S, id) && S.phase !== 'claiming') return 'free';
  if (p) return p.how === 'cash' && !p.confirmed ? 'cash' : 'paid';
  if (S.intents[id]) return 'sending';
  if (S.ready.includes(id)) return S.phase === 'settling' ? 'topay' : 'done';
  return S.phase === 'claiming' || S.phase === 'settling' ? 'choosing' : 'waiting';
}
function refreshLive(ctx, animate = true) {
  if (ctx.dead || !ctx.ring || ctx.tab !== 'table') return;
  const s = shares(S), el = ctx.el;
  const count = id => lines(S).filter(l => (S.claims[l.id] || {})[id]).length;
  S.order.forEach(id => {
    const row = $(`.prow[data-id="${id}"]`, el); if (!row) return;
    const st = personState(id), p = S.paid[id], n = count(id);
    const sub = id === S.host ? (n ? `Paid the bill · had ${n} thing${n === 1 ? '' : 's'}` : 'Paid the bill') :
      st === 'free' ? `${P(S.game.outcome.loser).name} pays for them · lost the round` :
      st === 'paid' ? (p.how === 'cash' ? 'Paid in cash' : `Paid with ${p.wallet || 'a wallet'} · ${p.asset}`) :
      st === 'cash' ? 'Says they paid in cash' : st === 'sending' ? 'Sending a payment…' : `${n} thing${n === 1 ? '' : 's'}${st === 'choosing' ? ' so far' : ''}`;
    $('.pr-sub', row).textContent = sub;
    const amt = $('.pr-amt', row); if (animate) roll(amt, s.total[id] || 0); else setNum(amt, s.total[id] || 0);
    const pill = $('.pr-st', row), label = { host: 'paid bill', paid: 'paid', cash: 'Confirm cash', done: 'done', topay: 'to pay', choosing: 'choosing', waiting: 'joined', sending: 'sending', free: 'off the hook' }[st];
    if (pill.dataset.st !== st) {
      pill.dataset.st = st; pill.innerHTML = st === 'paid' ? `${ic('check', 13)}${label}` : label;
      pill.classList.toggle('confirm', st === 'cash');
      if (st === 'cash') pill.dataset.act = 'confirm'; else delete pill.dataset.act;
      pill.setAttribute('role', st === 'cash' ? 'button' : 'status');
      if (animate && !RM) gsap.fromTo(pill, { scale: .85 }, { scale: 1, duration: .4, ease: 'back.out(2.5)' });
    }
    if (id !== S.host) ctx.ring.state(id, st === 'paid' || st === 'free' ? 'paid' : st === 'choosing' ? 'choosing' : 'idle', st === 'paid' || st === 'free' ? 1 : (st === 'cash' || st === 'sending' ? .5 : 0));
    else ctx.ring.state(id, 'idle', 1);
  });
  const v = $('.rt-v', el), of = $('.rt-of', el);
  if (animate) roll(v, s.back); else setNum(v, s.back);
  of.textContent = S.phase === 'claiming' && s.unclaimed > 0 ? `of ${eur(s.owed)} so far` : `of ${eur(s.owed)}`;
  const lb = $('.left-banner', el), acts = $('.host-actions', el);
  if (S.phase === 'claiming' && s.unclaimed > 0) {
    lb.hidden = false;
    $('.stripes', lb).style.background = `repeating-linear-gradient(-45deg,${S.order.map((id, i) => `${col(id)} ${i * 4}px ${(i + 1) * 4}px`).join(',')})`;
    $('.lb-t', lb).innerHTML = `<b>${eur(s.unclaimed)}</b> not claimed yet. When everyone’s done, it’s split between all.`;
  } else lb.hidden = true;
  if (acts) {
    const notReady = S.order.filter(id => !S.ready.includes(id)).length;
    // One round per table: it can only be proposed while claiming, before any round has been settled.
    const canPlay = S.phase === 'claiming' && HEALTH.game && !(S.game && S.game.status !== 'cancelled') && S.order.length >= 2;
    acts.innerHTML = (canPlay ? `<button class="btn primary" type="button" data-act="round">${ic('fist', 20)}Who pays? Play a round</button>` : '')
      + (S.phase === 'claiming' ? `<button class="btn ghost" type="button" data-act="close">${notReady ? `Close the receipt now (${notReady} still choosing)` : 'Close the receipt'}</button>` : S.phase === 'settled' ? `<button class="btn primary" type="button" data-act="night">See the night${ic('chev')}</button>` : '');
  }
}
function livePaid(ctx, d) {
  const id = d.pid, p = S.paid[id]; if (!p) return;
  if (d.confirm) { UI.toast(`${av(id, 30)}<div><b>Cash from ${esc(P(id).name)}</b><small>Confirmed by you</small></div><span class="t-amt">${eur(p.cents)}</span>`); coin(ctx, id); return; }
  if (p.how === 'cash') { UI.toast(`${av(id, 30)}<div><b>${esc(P(id).name)} says they paid cash</b><small>Tap “Confirm cash” when you have it</small></div><span class="t-amt">${eur(p.cents)}</span>`, 3600); return; }
  UI.toast(`${av(id, 30)}<div><b>${esc(P(id).name)} paid you</b><small>${esc(p.amount ? Number(p.amount).toFixed(2) : '')} ${esc(p.asset)} · ledger ${fmtL(p.ledger)}</small></div><span class="t-amt">${eur(p.cents)}</span>`);
  coin(ctx, id);
}
function coin(ctx, id) {
  if (RM || !ctx.ring || ctx.tab !== 'table') return;
  const seat = ctx.ring.seat(id), center = $('.ring-table', ctx.ring.el); if (!seat || !center) return;
  const a = seat.querySelector('.seat-in').getBoundingClientRect(), b = center.getBoundingClientRect();
  const c = h(`<div class="coin">${S.currency === 'USD' ? '$' : '€'}</div>`); document.body.appendChild(c);
  const x1 = a.left + a.width / 2, y1 = a.top + a.height / 2, x2 = b.left + b.width / 2, y2 = b.top + b.height / 2, mx = (x1 + x2) / 2, my = Math.min(y1, y2) - 110, o = { t: 0 };
  gsap.set(c, { left: x1, top: y1, scale: .4, opacity: 0 });
  gsap.timeline({ onComplete: () => { c.remove(); gsap.fromTo(center, { scale: 1 }, { scale: 1.05, duration: .15, yoyo: true, repeat: 1 }); } })
    .to(c, { opacity: 1, scale: 1, duration: .2 })
    .to(o, { t: 1, duration: .75, ease: 'power2.inOut', onUpdate: () => { const t = o.t, u = 1 - t; gsap.set(c, { left: u * u * x1 + 2 * u * t * mx + t * t * x2, top: u * u * y1 + 2 * u * t * my + t * t * y2 }); } }, '<')
    .to(c, { scale: .5, opacity: 0, duration: .18 });
}
function quitsMoment(ctx) {
  if (ctx.dead || ctx.qm || S.phase !== 'settled') return;
  ctx.qm = true;
  $$('.toast', UI.toasts).forEach(t => gsap.to(t, { opacity: 0, y: -16, duration: .3, onComplete: () => t.remove() }));
  const s = shares(S), mins = Math.max(1, Math.round((S.tSettled - S.t0) / 60000));
  const ov = h(`<div class="qm"><div class="qm-dim"></div><div class="qm-card"><div class="qm-rc"></div><div class="qm-stamp">${stampSVG()}</div></div><div class="qm-text"><h2 class="t-xxl">Everyone’s quits.</h2><p class="sub">${S.order.length} people · ${eur(s.all)} · settled in ${mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h'}</p></div><div class="qm-foot"><button class="btn primary" type="button" data-qm="night">See the night${ic('chev')}</button></div></div>`);
  const rec = Receipt({ mode: 'mini' }); $('.qm-rc', ov).appendChild(rec.el); rec.paintAll(false);
  ctx.el.appendChild(ov);
  $('[data-qm=night]', ov).addEventListener('click', () => nav(`/t/${S.code}?night`));
  gsap.timeline()
    .from($('.qm-dim', ov), { opacity: 0, duration: D(.35) })
    .from($('.qm-card', ov), { y: 90, opacity: 0, rotation: -4, duration: D(.65), ease: 'power3.out' }, '<.05')
    .fromTo($('.qm-stamp', ov), { scale: 2.8, opacity: 0, rotation: -28 }, { scale: 1, opacity: 1, rotation: -11, duration: D(.28), ease: 'power4.in' }, '+=.2')
    .to($('.qm-card', ov), { x: -6, y: 4, duration: .05, yoyo: true, repeat: 3, ease: 'none' })
    .fromTo(UI.root, { x: 0 }, { x: 3, duration: .04, yoyo: true, repeat: 3, ease: 'none', clearProps: 'transform' }, '<')
    .from($$('.qm-text > *', ov), { y: 18, opacity: 0, duration: D(.45), stagger: .09, ease: 'power3.out' }, '-=.05')
    .from($('.qm-foot', ov), { y: 22, opacity: 0, duration: D(.4) }, '-=.2');
}

/* ---------- guest: join ---------- */
SCREENS.join = {
  render() {
    const taken = new Set(S.order.map(id => P(id).color));
    const pref = PROFILE.color && !taken.has(PROFILE.color) ? PROFILE.color : SWATCHES.find(c => !taken.has(c));
    const acc = accounts(), inn = signedIn();
    const colours = `<div class="field"><span class="label" id="sw-l">Your colour on the receipt</span><div class="sw" role="radiogroup" aria-labelledby="sw-l">${SWATCHES.slice(0, 8).map((c, i) => `<label style="--c:${c}" class="${taken.has(c) ? 'taken' : ''}"><input type="radio" name="g-color" id="g-color-${i}" value="${c}" aria-label="Colour ${i + 1}"${c === pref ? ' checked' : ''}${taken.has(c) ? ' disabled' : ''}><span class="sw-i"></span></label>`).join('')}</div></div>`;
    const fields = `<div class="field"><label class="label" for="g-name">Your name</label><input id="g-name" class="name-in" type="text" value="${esc(PROFILE.name)}" placeholder="Your name" maxlength="18" spellcheck="false"></div>
          <div class="field"><label class="label" for="g-handle">Telegram or X <span class="opt">· optional</span></label><input id="g-handle" class="hand-in" type="text" placeholder="@your_handle" value="${esc(PROFILE.contact)}" maxlength="32" spellcheck="false"><small class="hint">Only people at this table see it.</small></div>`;
    const form = acc && !inn
      ? `${colours}
         <div class="gjoin"><div class="gbtn"></div><small class="hint">Keeps this night and your friends in your account.</small></div>
         <div class="or"><span>or join without an account</span></div>
         ${fields}`
      : `${inn ? `<div class="hello">${meAvatar(40)}<div><b>Joining as ${esc(PROFILE.name || USER.name)}</b><span>${esc(USER.email)}</span></div></div>` : ''}
         ${fields}${colours}`;
    return h(`<section>
      <header class="scr-head"><span class="urlbar">${ic('lock', 13)}${esc(location.host)}/t/${esc(S.code)}</span></header>
      <div class="scr-body join-body">
        ${ticketHTML(`${av(S.host, 34)}<div><b>${esc(P(S.host).name)} opened this table</b><small>${esc(P(S.host).name)} paid the bill. You pay back your part.</small></div><span class="grow"></span><span class="tk-code">${esc(S.code)}</span>`)}
        <div class="here"><span class="avs"></span><span class="here-t"></span></div>
        <form class="form" autocomplete="off">
          ${form}
          <p class="form-err" hidden></p>
        </form>
      </div>
      <footer class="scr-foot">${acc && !inn
        ? '<button class="btn ghost" type="button" data-act="join">Join without an account</button><p class="foot-note">No app needed. You only need a wallet to pay.</p>'
        : '<button class="btn primary" type="button" data-act="join">Join the table</button><p class="foot-note">No app needed. You only need a wallet to pay.</p>'}</footer>
    </section>`);
  },
  enter(ctx) {
    const upd = () => {
      $('.avs', ctx.el).innerHTML = S.order.map(id => av(id, 30)).join('');
      const names = S.order.map(id => P(id).name);
      $('.here-t', ctx.el).textContent = `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} ${names.length === 1 ? 'is' : 'are'} at the table`;
      const taken = new Map(S.order.map(id => [P(id).color, id]));
      $$('.sw label', ctx.el).forEach(lb => { const inp = $('input', lb), t = taken.get(inp.value); lb.classList.toggle('taken', !!t); inp.disabled = !!t; $('.sw-i', lb).textContent = t ? P(t).name[0] : ''; if (t && inp.checked) { inp.checked = false; const free = $$('.sw input', ctx.el).find(x => !x.disabled); if (free) free.checked = true; } });
    };
    upd(); on('join', upd, ctx.bag);
    on('phase', () => { if (!tableOpen()) routeTable(true); }, ctx.bag);
    if (!RM) { gsap.from($('.ticket', ctx.el), { y: 34, opacity: 0, rotation: -2, duration: .7, ease: 'power3.out', delay: .1 }); gsap.from($$('.join-body > :not(.ticket)', ctx.el), { y: 16, opacity: 0, duration: .45, stagger: .07, ease: 'power2.out', delay: .35 }); }
    $('form', ctx.el).addEventListener('submit', e => { e.preventDefault(); SCREENS.join.act.join(ctx, $('[data-act=join]', ctx.el)); });
    const g = $('.gbtn', ctx.el);
    if (g) googleButton(g, async () => {
      // signed in: this seat may already be theirs (another phone); otherwise join straight away with their account
      const j = await api(`/t/${S.code}/state`);
      if (j.me) { ME = { pid: j.me, token: '' }; LS.set('t:' + S.code, ME); connect(S.code); applyState(j.s); routeTable(true); return; }
      const nm = $('#g-name', ctx.el); if (nm && !nm.value.trim()) nm.value = PROFILE.name || USER.name || '';
      await SCREENS.join.act.join(ctx, $('[data-act=join]', ctx.el));
    });
  },
  act: {
    async join(ctx, b) {
      const name = ($('#g-name', ctx.el).value.trim() || (signedIn() ? PROFILE.name || USER.name : '')).slice(0, 18), errEl = $('.form-err', ctx.el);
      if (!name) { errEl.textContent = 'Add your name so the table knows who you are.'; errEl.hidden = false; $('#g-name', ctx.el).focus(); return; }
      const raw = $('#g-handle', ctx.el).value.trim().replace(/^@+/, ''), contact = raw ? '@' + raw : '';
      const pick = $('input[name=g-color]:checked', ctx.el);
      busy(b, true, 'Joining');
      try {
        const j = await api(`/t/${S.code}/join`, { name, color: pick ? pick.value : '', contact });
        LS.set('t:' + S.code, { pid: j.pid, token: j.token }); ME = { pid: j.pid, token: j.token }; connect(S.code);
        Object.assign(PROFILE, { name, contact, color: j.s.people[j.pid].color }); saveProfile();
        pushProfile({ name, contact, color: PROFILE.color });
        applyState(j.s); routeTable(true);
      } catch (e) { errEl.textContent = e.message; errEl.hidden = false; busy(b, false); }
    },
  },
};

/* ---------- not at this table, and it is closed ---------- */
SCREENS.closed = {
  render() {
    return h(`<section><header class="scr-head"><span class="urlbar">${ic('lock', 13)}${esc(location.host)}/t/${esc(S.code)}</span></header>
      <div class="scr-body join-body">${ticketHTML(`${av(S.host, 34)}<div><b>${esc(P(S.host).name)}’s table</b><small>Already paying back. Ask ${esc(P(S.host).name)} to add you.</small></div>`)}</div>
      <footer class="scr-foot"><button class="btn ghost" type="button" data-act="home">Go to Quits</button></footer></section>`);
  },
  act: { home() { nav('/'); } },
};

/* ---------- guest: pay the host back ---------- */
SCREENS.pay = {
  render(ctx) {
    const s = shares(S), me = ME.pid, cents = s.total[me] || 0, host = P(S.host).name;
    ctx.asset = (S.intents[me] && S.intents[me].asset) || (S.accept.includes('EURC') && S.currency === 'EUR' ? 'EURC' : S.accept[0]);
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back to the receipt">${ic('back', 22)}</button><span class="head-t">Pay back</span><span class="grow"></span>${netPill()}</header>
      <div class="scr-body pay-body">
        <div class="payee">${av(S.host, 52)}<span class="who">Pay ${esc(host)}</span><span class="amt">${eur(cents)}</span><span class="conv"></span></div>
        <div class="brk"><div><span>Your plates and drinks</span><span>${eur(s.items[me] || 0)}</span></div>${s.leftShare[me] ? `<div><span>Your share of the leftovers</span><span>${eur(s.leftShare[me])}</span></div>` : ''}${s.tip[me] ? `<div><span>Tip (${S.tip}%)</span><span>${eur(s.tip[me])}</span></div>` : ''}${roundExtra(me) ? `<div><span>The round: ${esc(roundNames(me))}</span><span>${eur(roundExtra(me))}</span></div>` : ''}</div>
        ${S.accept.length > 1 ? `<div class="seg" role="radiogroup" aria-label="Pay in">${S.accept.map(a => `<button type="button" role="radio" data-act="asset" data-asset="${a}" aria-checked="${ctx.asset === a}">${a}<small>${a === 'EURC' ? 'digital euros' : 'digital dollars'}</small></button>`).join('')}</div>` : ''}
        <span class="label">Pay from</span>
        <div class="payopts">
          ${HEALTH.wc ? `<button class="payopt" type="button" data-act="wallet" data-kind="app"><span class="wal-ic">${ic('wallet', 20)}</span><span class="wal-t"><b>A wallet app on this phone</b><small>LOBSTR, Freighter and others. You approve it there.</small></span>${ic('chev', 18)}</button>` : ''}
          ${!isMobile ? `<button class="payopt" type="button" data-act="wallet" data-kind="browser"><span class="wal-ic">${ic('wallet', 20)}</span><span class="wal-t"><b>A browser wallet</b><small>Freighter, xBull, LOBSTR extension…</small></span>${ic('chev', 18)}</button>` : ''}
          <button class="payopt" type="button" data-act="manual"><span class="wal-ic">${ic('send', 20)}</span><span class="wal-t"><b>Send it yourself</b><small>From Decaf, any Stellar wallet or an exchange, with a code.</small></span>${ic('chev', 18)}</button>
        </div>
        <div class="manual" hidden></div>
        <button class="other" type="button" data-act="cash">${ic('cash', 22)}<div><b>Paid another way?</b><small>Cash, Bizum, MB WAY or card. ${esc(host)} confirms it.</small></div>${ic('chev', 18)}</button>
        <p class="trust">${ic('lock', 16)}<span>Goes straight to ${esc(host)}’s wallet. Quits never holds the money.</span></p>
      </div>
    </section>`);
  },
  enter(ctx) {
    const conv = () => { const cents = shares(S).total[ME.pid] || 0; $('.conv', ctx.el).textContent = `${dueAmount(cents, ctx.asset, S.currency, S.rate && S.rate.eurUsd)} ${ctx.asset}${(ctx.asset === 'EURC' && S.currency === 'EUR') || (ctx.asset === 'USDC' && S.currency === 'USD') ? ' · no conversion' : ' at today’s rate'}`; };
    conv(); ctx.conv = conv;
    if (HEALTH.wc || !isMobile) (window.requestIdleCallback || setTimeout)(() => import('./wallet.js').catch(() => {}));
    if (S.intents[ME.pid]) showManual(ctx);
    on('paid', d => { if (d.pid === ME.pid) UI.go('paid', { dir: 'fade' }); }, ctx.bag);
    on('intents', () => { if (ctx.manualOpen) showManual(ctx); }, ctx.bag);
    if (!RM) gsap.from($$('.payee > *, .brk, .pay-body > .seg, .pay-body > .label, .payopts, .other, .trust', ctx.el), { y: 16, opacity: 0, duration: .45, stagger: .05, ease: 'power3.out', delay: .1 });
  },
  act: {
    back() { UI.go('claim', { dir: 'back', quiet: true }); },
    asset(ctx, b) { if (S.intents[ME.pid] && S.intents[ME.pid].asset !== b.dataset.asset) ctx.manualOpen = false; $$('[data-act=asset]', ctx.el).forEach(x => x.setAttribute('aria-checked', String(x === b))); ctx.asset = b.dataset.asset; ctx.conv(); if (ctx.manualOpen) startManual(ctx); else $('.manual', ctx.el).hidden = true; },
    async manual(ctx, b) { busy(b, true); try { await startManual(ctx); } finally { busy(b, false); } },
    async check(ctx, b) { busy(b, true, 'Looking on Stellar'); try { await act('check'); if (!S.paid[ME.pid]) UI.toast('<div><b>Not on Stellar yet</b><small>It can take a few seconds. We keep looking.</small></div>', 2600); } catch (e) { /* toasted */ } busy(b, false); },
    async copy(ctx, b) { copyText(b.dataset.v, b); },
    async wallet(ctx, b) {
      busy(b, true, 'Opening your wallet');
      try {
        await act('intent', { asset: ctx.asset });
        const it = S.intents[ME.pid];
        const w = await import('./wallet.js');
        const r = await w.pay(HEALTH, { network: S.network, to: S.hostAddress, asset: it.asset, amount: it.amount, memo: it.memo, kind: b.dataset.kind });
        UI.toast(`<div><b>Sent. Checking on Stellar…</b></div>`, 2000);
        const j = await act('paid', { tx: r.hash, wallet: r.wallet });
        if (!j.ok) UI.toast(`<div><b>We’ll keep checking</b><small>${esc(j.why || '')}</small></div>`, 3000);
      } catch (e) { UI.toast(`<div><b>The payment didn’t go through</b><small>${esc(e.message || 'Try again, or send it yourself.')}</small></div>`, 4200); }
      busy(b, false);
    },
    async cash(ctx, b) { busy(b, true); try { await act('cash'); UI.go('paid', { dir: 'fade' }); } catch (e) { busy(b, false); } },
  },
};
async function startManual(ctx) {
  ctx.manualOpen = true;
  const cur = S.intents[ME.pid];
  if (!cur || cur.asset !== ctx.asset || cur.cents !== (shares(S).total[ME.pid] || 0)) await act('intent', { asset: ctx.asset });
  showManual(ctx);
}
function showManual(ctx) {
  ctx.manualOpen = true;
  const it = S.intents[ME.pid], box = $('.manual', ctx.el); if (!it || !box) return;
  const key = JSON.stringify(it); if (ctx.shownIntent === key && !box.hidden) return; ctx.shownIntent = key;
  const issuer = NETWORKS[S.network].assets[it.asset];
  const uri = `web+stellar:pay?destination=${S.hostAddress}&amount=${it.amount}&asset_code=${it.asset}&asset_issuer=${issuer}&memo=${encodeURIComponent(it.memo)}&memo_type=MEMO_TEXT`;
  box.hidden = false;
  box.innerHTML = `<b>Send exactly this</b>
    <div class="cprow"><div><small>To ${esc(P(S.host).name)}’s address</small><b>${esc(S.hostAddress)}</b></div><button type="button" data-act="copy" data-v="${esc(S.hostAddress)}"><span>Copy</span></button></div>
    <div class="cprow"><div><small>Amount</small><b>${esc(it.amount)} ${esc(it.asset)}</b></div><button type="button" data-act="copy" data-v="${esc(it.amount)}"><span>Copy</span></button></div>
    <div class="cprow"><div><small>Memo (the code)</small><b>${esc(it.memo)}</b></div><button type="button" data-act="copy" data-v="${esc(it.memo)}"><span>Copy</span></button></div>
    <p class="warnbox">Don’t forget the memo. It’s how Quits knows the payment is yours. ${it.asset} must be the one issued by Circle.</p>
    ${isMobile ? `<a class="btn ghost sm open-wallet" href="${esc(uri)}">${ic('ext', 16)}Open in my wallet app</a><small class="hint">Works with wallets that open Stellar payment links. If nothing opens, copy the three lines above.</small>` : `<div class="qr" title="Scan with the wallet on your phone">${qrSVG(uri, 'L')}</div>`}
    <div class="waiting"><span class="spin"></span><span>Waiting for your payment on Stellar…</span></div>
    <button class="btn ghost" type="button" data-act="check">I’ve sent it</button>`;
  if (!RM) gsap.from(box, { y: 14, opacity: 0, duration: .4, ease: 'power2.out' });
}

/* ---------- guest: paid ---------- */
SCREENS.paid = {
  render() {
    const me = ME.pid, p = S.paid[me] || { how: 'cash', cents: shares(S).total[me] }, cash = p.how === 'cash', host = P(S.host).name;
    const ex = p.tx ? `${NETWORKS[S.network].explorer}/tx/${p.tx}` : '';
    return h(`<section>
      <header class="scr-head"><span class="urlbar">${ic('lock', 13)}${esc(location.host)}/t/${esc(S.code)}</span></header>
      <div class="scr-body paid-body">
        <div class="okbadge">${ic('check', 30)}</div>
        <div class="paid-h"><h1 class="t-xl">${cash && !p.confirmed ? `${esc(host)} will confirm your cash` : `You’re quits with ${esc(host)}`}</h1><p class="sub">${cash ? `${eur(p.cents)} · ${p.confirmed ? 'paid in cash' : 'marked as paid in cash'}` : `${eur(p.cents)} · ${esc(Number(p.amount).toFixed(2))} ${esc(p.asset)} · ledger ${fmtL(p.ledger)}`}</p></div>
        <div class="yours"><div class="yours-rc"></div><div class="yours-stamp">${stampSVG()}</div></div>
        <div class="progress-line"><span class="avs"></span><span class="pl-t"></span></div>
        ${keepCard()}
        <p class="note">${ex ? `<a class="txlink" href="${ex}" target="_blank" rel="noopener">See the payment on Stellar ${ic('ext', 13)}</a>. ` : ''}${signedIn() ? 'This night is in your profile.' : 'This night stays on this phone.'}</p>
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="night" disabled>Waiting for the others</button></footer>
    </section>`);
  },
  enter(ctx) {
    $('.yours-rc', ctx.el).appendChild(YourPart(ME.pid));
    if (!RM) { gsap.from($('.okbadge', ctx.el), { scale: 0, rotation: -30, duration: .6, ease: 'back.out(2.4)' }); gsap.from($$('.paid-h > *, .yours, .progress-line, .note', ctx.el), { y: 18, opacity: 0, duration: .5, stagger: .07, ease: 'power3.out', delay: .15 }); }
    const upd = () => {
      const owing = S.order.filter(id => id !== S.host), n = owing.filter(id => S.paid[id] && S.paid[id].confirmed).length;
      $('.progress-line .avs', ctx.el).innerHTML = owing.map(id => av(id, 24, S.paid[id] && S.paid[id].confirmed ? '' : 'off')).join('');
      $('.pl-t', ctx.el).innerHTML = S.phase === 'settled' ? '<b>Everyone’s quits.</b>' : `<b>${n} of ${owing.length}</b> paid ${esc(P(S.host).name)} back`;
      const b = $('[data-act=night]', ctx.el); if (S.phase === 'settled') { b.disabled = false; b.innerHTML = `See the night${ic('chev')}`; }
    };
    upd();
    on('paid', d => { upd(); if (d.pid === ME.pid && d.confirm) UI.go('paid', { dir: 'none' }); }, ctx.bag);
    on('phase', () => { upd(); if (S.phase === 'settled') stampYours(ctx); }, ctx.bag);
    if (S.phase === 'settled') stampYours(ctx, false);
    keepButton(ctx, () => UI.go('paid', { dir: 'none' }));
  },
  act: { night() { nav(`/t/${S.code}?night`); } },
};
// Signing in keeps the night: photos, who was there and what you paid, on any phone.
function keepCard() {
  if (!accounts() || signedIn()) return '';
  return `<div class="keep"><div class="keep-t"><b>Keep this night</b><span>Sign in and the photos, who was there and what you paid stay in your profile, on any phone.</span></div><div class="gbtn"></div></div>`;
}
function keepButton(ctx, after) {
  const g = $('.keep .gbtn', ctx.el);
  if (g) googleButton(g, async () => { UI.toast(`${ic('check', 18)}<div><b>Kept in your profile</b></div>`, 2200); after(); });
}
function stampYours(ctx, animate = true) {
  const st = $('.yours-stamp', ctx.el); if (!st || st._done) return; st._done = true;
  if (!animate || RM) { gsap.set(st, { opacity: 1, rotation: -9 }); return; }
  gsap.fromTo(st, { scale: 2.6, opacity: 0, rotation: -26 }, { scale: 1, opacity: 1, rotation: -9, duration: .28, ease: 'power4.in' });
  gsap.fromTo($('.yours', ctx.el), { x: 0 }, { x: -5, duration: .05, yoyo: true, repeat: 3, delay: .28, ease: 'none', clearProps: 'transform' });
}

/* ---------- the night, kept ---------- */
function itemsOf(id) {
  return lines(S).filter(l => (S.claims[l.id] || {})[id]).map(l => {
    const c = S.claims[l.id], n = S.order.filter(x => c[x] > 0).length, name = l.en || l.name.toLowerCase();
    if (l.kind === 'each') return c[id] > 1 ? `${name} ×${c[id]}` : name;
    return n > 1 ? `${name} ${FRAC[n] || '1/' + n}` : name;
  });
}
const photoHTML = p => `<figure class="ph" data-id="${esc(p.id)}"><img src="${imgUrl(S.code, p.id)}" alt="Photo added by ${esc(P(p.by).name)}" loading="lazy">${av(p.by, 20)}</figure>`;
SCREENS.memory = {
  render() {
    const s = shares(S), mins = Math.max(1, Math.round(((S.tSettled || Date.now()) - S.t0) / 60000)), me = ME && S.people[ME.pid] ? ME.pid : null;
    const ppl = S.order.map(id => `<li>${av(id, 30)}<div class="mp-main"><b>${id === S.host ? `${esc(P(id).name)} · paid the bill` : esc(P(id).name)}</b><span>${esc(itemsOf(id).join(' · ')) || 'Leftovers'}${s.leftShare[id] ? ' · leftovers' : ''}</span>${P(id).contact ? `<span class="mp-h">${esc(P(id).contact)}</span>` : ''}</div>${me ? `<span class="mp-amt mono">${eur(s.total[id])}</span>` : ''}</li>`).join('');
    const txs = S.order.filter(id => id !== S.host && S.paid[id]).map(id => {
      const p = S.paid[id];
      return p.how === 'cash'
        ? `<li>${av(id, 26)}<div class="tx-main"><b>${esc(P(id).name)} → ${esc(P(S.host).name)}</b><span>Cash, confirmed by ${esc(P(S.host).name)}</span></div><span class="mono">${eur(p.cents)}</span></li>`
        : `<li>${av(id, 26)}<div class="tx-main"><b>${esc(P(id).name)} → ${esc(P(S.host).name)}</b><a class="txlink mono" href="${NETWORKS[S.network].explorer}/tx/${esc(p.tx)}" target="_blank" rel="noopener">ledger ${fmtL(p.ledger)} · tx ${esc(p.tx.slice(0, 4))}…${esc(p.tx.slice(-4))}</a></div><span class="mono">${esc(Number(p.amount).toFixed(2))} ${esc(p.asset)}</span>${S.network === 'testnet' ? '<span class="net">testnet</span>' : ''}</li>`;
    }).join('');
    return h(`<section class="mem">
      <div class="mem-scroll">
        <div class="mem-hero">${coverImg(S)}<div class="tk-grad"></div>
          <button class="icon-btn" type="button" data-act="home" aria-label="Your nights">${ic('back', 22)}</button>
          ${S.phase === 'settled' ? `<div class="mem-stamp">${stampSVG()}</div>` : ''}
          <div class="mem-t"><span class="label">The night</span><h1 class="t-xxl">${esc(S.name)}</h1><p>${dayLabel(S.t0)} ${new Date(S.t0).getFullYear()} · ${timeLabel(S.t0)}</p></div>
        </div>
        <div class="mem-in">
          <div class="mem-stats"><div><b>${S.order.length}</b><span>at the table</span></div><div><b>${eur(s.all)}</b><span>the whole bill</span></div><div><b>${S.tSettled ? (mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h') : '—'}</b><span>to settle</span></div></div>
          ${me ? keepCard() : ''}
          <h2 class="h2">Photos from the night</h2>
          <div class="pgrid">${me ? `<label class="padd" for="mem-photo">${ic('camera', 22)}<span>Add a photo</span></label><input id="mem-photo" class="cap-in" type="file" accept="image/*" multiple>` : ''}${S.photos.map(photoHTML).join('')}</div>
          <p class="note pnote">${S.photos.length ? 'Everyone at the table can add photos. They stay with the night.' : 'No photos yet. Anyone at the table can add the first one.'}</p>
          ${roundCard()}
          ${S.receipt ? `<h2 class="h2">Who had what</h2><ul class="mem-ppl">${ppl}</ul>` : ''}
          ${txs ? `<h2 class="h2">Paid back</h2><ul class="mem-tx">${txs}</ul><p class="note">Every payment went straight from each wallet to ${esc(P(S.host).name)}’s. Quits never held the money.</p>` : ''}
        </div>
      </div>
      <footer class="scr-foot">${me ? `<button class="btn primary" type="button" data-act="share">${ic('share', 18)}Share the night</button>` : '<button class="btn primary" type="button" data-act="try">Split your next bill with Quits</button>'}</footer>
    </section>`);
  },
  enter(ctx) {
    const el = ctx.el, inp = $('#mem-photo', el);
    keepButton(ctx, () => UI.go('memory', { dir: 'none' }));
    if (inp) inp.addEventListener('change', async e => {
      const files = [...(e.target.files || [])].slice(0, 6); e.target.value = '';
      for (const f of files) { try { const data = await compress(f, 1440, 0.8); await api(`/t/${S.code}/photo`, { image: data }, ME); } catch (err) { UI.toast(`<div><b>Couldn’t add that photo</b><small>${esc(err.message)}</small></div>`); } }
    });
    on('photo', d => { const grid = $('.pgrid', el); if (!grid) return; const f = h(photoHTML(d.photo)); grid.insertBefore(f, inp ? inp.nextSibling : grid.firstChild); $('.pnote', el).textContent = 'Everyone at the table can add photos. They stay with the night.'; if (!RM) gsap.from(f, { scale: .6, opacity: 0, rotation: -6, duration: .55, ease: 'back.out(2)' }); }, ctx.bag);
    if (RM) return;
    const im = $('.mem-hero img', el); if (im) gsap.fromTo(im, { scale: 1.12 }, { scale: 1, duration: 2.4, ease: 'power2.out' });
    const st = $('.mem-stamp', el); if (st) gsap.fromTo(st, { scale: 2.4, opacity: 0, rotation: -10 }, { scale: 1, opacity: .95, rotation: 9, duration: .3, ease: 'power4.in', delay: .6 });
    gsap.from($$('.mem-t > *', el), { y: 20, opacity: 0, duration: .55, stagger: .08, ease: 'power3.out', delay: .15 });
    gsap.from($$('.mem-stats > div, .mem-in > .h2, .mem-ppl li, .mem-tx li', el), { y: 16, opacity: 0, duration: .45, stagger: .04, ease: 'power2.out', delay: .4 });
  },
  act: {
    home() { nav('/', { dir: 'back' }); },
    share(ctx) { openShare(ctx); },
    try() { nav('/'); },
  },
};
function openShare(ctx) {
  if (ctx.el.querySelector('.sheet-wrap')) return;
  const mins = Math.max(1, Math.round(((S.tSettled || Date.now()) - S.t0) / 60000));
  const text = `${S.name}. ${S.order.length} at the table${S.phase === 'settled' ? `, everyone paid back on Stellar in ${mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h'}` : ''}.`;
  const url = nightUrl(S.code);
  const sh = h(`<div class="sheet-wrap"><div class="sheet-dim"></div><div class="sheet share" role="dialog" aria-label="Share the night">
    <div class="sh-top"><div class="grab"></div><button class="icon-btn sh-x" type="button" data-sh="close" aria-label="Close">${ic('close', 20)}</button></div>
    <div class="scard">${coverImg(S)}<div class="sc-grad"></div>${S.phase === 'settled' ? `<div class="sc-stamp">${stampSVG()}</div>` : ''}
      <div class="sc-t"><span class="wordmark sm"><span class="wm-hl"></span><span class="wm-t">quits</span></span><b>${esc(S.name)}</b><span>${dayLabel(S.t0)} ${new Date(S.t0).getFullYear()}</span><span class="sc-avs">${S.order.map(id => av(id, 24)).join('')}</span><span>${S.order.length} at the table${S.phase === 'settled' ? ' · everyone paid back on Stellar' : ''}</span></div></div>
    ${navigator.share ? `<button class="btn primary" type="button" data-sh="native">${ic('share', 18)}Share</button>` : ''}
    <a class="btn ${navigator.share ? 'ghost' : 'primary'}" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener" data-sh="x">Post on X</a>
    <button class="btn ghost" type="button" data-sh="copy">${ic('link', 18)}<span>Copy the link</span></button>
  </div></div>`);
  ctx.el.appendChild(sh);
  gsap.from($('.sheet-dim', sh), { opacity: 0, duration: D(.3) });
  gsap.from($('.sheet', sh), { yPercent: 110, duration: D(.5), ease: 'power3.out' });
  const close = () => gsap.to($('.sheet', sh), { yPercent: 110, duration: D(.35), ease: 'power2.in', onComplete: () => sh.remove() });
  sh.addEventListener('click', async e => {
    const b = e.target.closest('[data-sh]');
    if (!b) { if (e.target.classList.contains('sheet-dim')) close(); return; }
    if (b.dataset.sh === 'close') close();
    else if (b.dataset.sh === 'copy') copyText(url, b);
    else if (b.dataset.sh === 'native') { try { await navigator.share({ title: S.name, text, url }); close(); } catch (err) { /* cancelled */ } }
    else if (b.dataset.sh === 'x') later(400, close);
  });
}

/* ---------- profile and friends ---------- */
SCREENS.profile = {
  render() {
    const inn = signedIn(), count = inn ? (USER.nights || []).length : nights().length;
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back">${ic('back', 22)}</button><span class="head-t">You</span></header>
      <div class="scr-body prof-body">
        <div class="prof-top">${meAvatar(76)}<div><h1 class="t-xl">${esc(PROFILE.name || (USER && USER.name) || 'You')}</h1><p class="sub" style="margin-top:6px">${inn ? `${esc(USER.email)} · ` : ''}${count} ${count === 1 ? 'night' : 'nights'}${inn ? '' : ' on this phone'}</p></div></div>
        <form class="form" autocomplete="off">
          <div class="field"><label class="label" for="pf-name">Your name</label><input id="pf-name" class="in" type="text" maxlength="18" value="${esc(PROFILE.name)}"></div>
          <div class="field"><label class="label" for="pf-contact">Telegram or X</label><input id="pf-contact" class="in" type="text" maxlength="32" value="${esc(PROFILE.contact)}" placeholder="@your_handle"><span class="helper">Only people at your tables see it.</span></div>
          <div class="field"><label class="label" for="pf-addr">Your Stellar address</label><input id="pf-addr" class="in mono" type="text" spellcheck="false" value="${esc(PROFILE.address)}" placeholder="G…"><span class="helper">Where friends pay you back when you pay the bill.</span></div>
          <div class="field"><span class="label">Your colour</span><div class="sw">${SWATCHES.slice(0, 8).map((c, i) => `<label style="--c:${c}"><input type="radio" name="pf-color" id="pf-color-${i}" value="${c}" aria-label="Colour ${i + 1}"${c === PROFILE.color ? ' checked' : ''}><span class="sw-i"></span></label>`).join('')}</div></div>
        </form>
        <button class="btn ghost" type="button" data-act="friends">${ic('users', 18)}Friends from your tables</button>
        ${inn ? `<button class="btn ghost" type="button" data-act="out">Sign out</button>` : ''}
        <div class="prof-links"><a href="/privacy" data-act="privacy">Privacy</a>${inn ? '<button type="button" data-act="del">Delete my account</button>' : ''}</div>
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="save">Save</button></footer>
    </section>`);
  },
  act: {
    back() { nav('/', { dir: 'back' }); },
    friends() { nav('/friends'); },
    privacy() { nav('/privacy'); },
    async save(ctx, b) {
      const el = ctx.el, addr = $('#pf-addr', el).value.trim().toUpperCase();
      if (addr && !/^G[A-Z2-7]{55}$/.test(addr)) { UI.toast('<div><b>That address doesn’t look right</b><small>It starts with G and has 56 characters.</small></div>'); return; }
      const raw = $('#pf-contact', el).value.trim().replace(/^@+/, '');
      const c = $('input[name=pf-color]:checked', el);
      Object.assign(PROFILE, { name: $('#pf-name', el).value.trim(), contact: raw ? '@' + raw : '', address: addr, color: c ? c.value : PROFILE.color }); saveProfile();
      if (signedIn()) { busy(b, true); await pushProfile({ name: PROFILE.name, contact: PROFILE.contact, address: PROFILE.address, color: PROFILE.color }); busy(b, false); }
      UI.toast(`${ic('check', 18)}<div><b>${signedIn() ? 'Saved' : 'Saved on this phone'}</b></div>`, 1800);
    },
    out() { signOutLocal(); nav('/', { dir: 'back' }); },
    async del(ctx, b) {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Tap again to delete your account'; later(4000, () => { delete b.dataset.sure; b.textContent = 'Delete my account'; }); return; }
      try { await api('/me/delete', {}); } catch (e) { /* signed out anyway */ }
      signOutLocal(); LS.set('nights', []); UI.toast('<div><b>Your account is deleted</b></div>', 2400); nav('/', { dir: 'back' });
    },
  },
};
SCREENS.friends = {
  render() {
    const fr = friendsFromNights();
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="back" aria-label="Back">${ic('back', 22)}</button><span class="head-t">Friends</span><span class="grow"></span><span class="chip">${fr.length}</span></header>
      <div class="scr-body">
        <h1 class="t-xl" style="margin-top:6px">People you’ve shared a table with</h1>
        ${fr.length ? `<ul class="flist">${fr.map(f => `<li class="frow"><span class="av" style="--c:${esc(f.color)};--z:40px">${esc(f.name[0].toUpperCase())}</span><div class="fm"><b>${esc(f.name)}</b><span>${f.nights} ${f.nights === 1 ? 'night' : 'nights'} together · ${esc(f.last)}</span></div>${f.contact ? `<span class="chip">${esc(f.contact)}</span>` : ''}</li>`).join('')}</ul>` : '<div class="empty"><b>No friends here yet</b>The people at your tables show up here, with their Telegram or X if they share it.</div>'}
      </div>
    </section>`);
  },
  act: { back() { history.length > 1 ? history.back() : nav('/'); } },
};
/* ---------- invite code: opening tables is by invite (joining never is) ---------- */
SCREENS.code = {
  render() {
    const next = new URLSearchParams(location.search).get('next');
    return h(`<section>
      <header class="scr-head"><button class="icon-btn" type="button" data-act="skip" aria-label="Back">${ic('back', 22)}</button><span class="head-t">${next === 'new' ? 'New table' : 'Welcome'}</span></header>
      <div class="scr-body code-body">
        ${signedIn() ? `<div class="hello">${meAvatar(44)}<div><b>Hi, ${esc(PROFILE.name || USER.name || 'there')}</b><span>${esc(USER.email)}</span></div></div>` : ''}
        <h1 class="t-xl" style="margin-top:6px">Got an invite code?</h1>
        <p class="sub">Opening tables is by invite for now. Joining a friend’s table never needs one.</p>
        <form class="form" autocomplete="off">
          <div class="field"><label class="label" for="inv-code">Invite code</label><input id="inv-code" class="in code-in" type="text" autocapitalize="characters" autocorrect="off" spellcheck="false" maxlength="24" placeholder="WORD-0000"></div>
          <p class="form-err" hidden></p>
        </form>
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="go">Continue${ic('chev')}</button>${next === 'home' ? '<button class="btn ghost" type="button" data-act="skip">I’m only joining friends’ tables</button>' : ''}</footer>
    </section>`);
  },
  enter(ctx) {
    $('form', ctx.el).addEventListener('submit', e => { e.preventDefault(); SCREENS.code.act.go(ctx, $('[data-act=go]', ctx.el)); });
    later(450, () => { if (!ctx.dead) $('#inv-code', ctx.el).focus(); });
  },
  act: {
    skip() { history.replaceState({}, '', '/'); route(); },
    async go(ctx, b) {
      const inp = $('#inv-code', ctx.el), errEl = $('.form-err', ctx.el), code = inp.value.trim().toUpperCase();
      if (!code) { inp.focus(); return; }
      errEl.hidden = true; busy(b, true, 'Checking');
      try {
        const nope = new Error('That code doesn’t work. Check it with whoever gave it to you.');
        if (accounts()) { const j = await api('/me/invite', { code }); if (!j.ok) throw nope; setUser(j.user); }
        else { const j = await api('/invite', { code }); if (!j.ok) throw nope; LS.set('invite', code); }
        const next = new URLSearchParams(location.search).get('next');
        history.replaceState({}, '', next === 'new' ? '/new' : '/'); route();
      } catch (e) {
        if (e.need === 'login') { signOutLocal(); history.replaceState({}, '', '/'); route(); return; }
        errEl.textContent = e.message; errEl.hidden = false; shake(inp); busy(b, false);
      }
    },
  },
};

SCREENS.notfound = {
  render(ctx) {
    return h(`<section><header class="scr-head"><span class="wordmark"><span class="wm-hl"></span><span class="wm-t">quits</span></span></header><div class="scr-body"><div class="empty"><b>${esc(ctx.opts.title || 'No table with this code')}</b>${esc(ctx.opts.text || 'Check the link or scan the QR again.')}</div></div><footer class="scr-foot"><button class="btn primary" type="button" data-act="home">Go to Quits</button></footer></section>`);
  },
  act: { home() { nav('/'); } },
};

/* ================= "Who pays?": a round of hidden coins, judged on Stellar ================= */
// Everyone in the round hides 0–3 coins and guesses the total. The move is sealed (a signed hash)
// and opened later on the whopays contract; the player furthest from the real total pays the
// parts of everyone who played. The key that signs lives only in this phone.
const GKEY = () => (S && S.game ? `g:${S.code}:${S.game.id}` : null);
const gmem = () => (GKEY() ? LS.get(GKEY(), null) : null);
const gsave = v => { if (GKEY()) LS.set(GKEY(), v); };
function myRoundKey() {
  let m = gmem();
  if (!m || !m.priv) { const priv = randomBytes(32); m = { ...(m || {}), priv: hex(priv), pk: hex(ed.getPublicKey(priv)) }; gsave(m); }
  return m;
}
const roundPlayers = () => (S.game ? (S.game.active && S.game.active.length ? S.game.active : S.game.players) : []);
const inRound = () => !!(S && S.game && ME && S.game.players.includes(ME.pid));
const activeInRound = () => !!(S && S.game && ME && roundPlayers().includes(ME.pid));
const roundLoser = () => (S.game && S.game.outcome ? S.game.outcome.loser : null);
// What the loser pays on top of their own part: everyone else's, and whose.
function roundExtra(me) { const p = gamePool(S); if (!p || roundLoser() !== me) return 0; const s = shares(S); return s.total[me] - ((s.items[me] || 0) + (s.leftShare[me] || 0) + (s.tip[me] || 0)); }
function roundNames(me) { const p = (gamePool(S) || []).filter(id => id !== me).map(id => P(id).name); return p.length > 2 ? `${p.slice(0, 2).join(', ')} and ${p.length - 2} more` : p.join(' and '); }
const coinsDots = n => `<span class="coins-d" aria-label="${n} coins">${Array.from({ length: 3 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
const txA = (tx, label = 'See it on Stellar') => (tx ? `<a class="txlink" href="${esc(S.game.explorer)}/tx/${esc(tx)}" target="_blank" rel="noopener">${label} ${ic('ext', 12)}</a>${S.game.network === 'testnet' ? ' <span class="net">testnet</span>' : ''}` : '');

function roundOutcomeText(g, me) {
  const L = g.outcome.loser, who = L === me ? 'You' : P(L).name, their = L === me ? 'your' : 'their';
  if (g.outcome.reason === 'noreveal') return `${who} never opened ${their} move in time. Silence loses.`;
  const mv = g.opened[L] || {};
  return `${g.outcome.total} coin${g.outcome.total === 1 ? '' : 's'} on the table. ${who} said ${mv.guess}, furthest off${g.outcome.drawn ? ' — tied, and the contract drew ' + (L === me ? 'you' : P(L).name) : ''}.`;
}
function roundPlayersList(g, { moves = false } = {}) {
  return `<ul class="gplayers">${roundPlayers().map(id => {
    const o = g.opened[id], sealed = !!g.sealed[id];
    const right = moves ? (o ? `${coinsDots(o.coins)}<span class="gp-say">said <b>${o.guess}</b></span>` : `<span class="gp-say dim">${g.status === 'opening' ? 'opening…' : '·'}</span>`)
      : sealed ? `<span class="gp-say ok">${ic('check', 14)}sealed</span>` : `<span class="gp-say dim">choosing…</span>`;
    return `<li class="${roundLoser() === id ? 'loser' : ''}">${av(id, 28)}<b>${id === ME.pid ? 'You' : esc(P(id).name)}</b><span class="grow"></span>${right}</li>`;
  }).join('')}</ul>`;
}

// One sheet for the whole round; re-rendered when what it should show changes.
let GL = null;
function roundView() {
  const g = S && S.game; if (!g || !meIn()) return null;
  const m = gmem() || {}, me = ME.pid, host = isHost();
  if (g.status === 'invite') {
    if (m.dismissed === 'invite' && !host) return null;
    const yes = S.order.filter(id => g.answers[id] === true), no = S.order.filter(id => g.answers[id] === false), mine = g.answers[me];
    return { key: `invite:${yes.join()}:${no.join()}:${String(mine)}`, kind: 'sheet', html: `
      <div class="gh">${ic('fist', 26)}<h2 class="t-xl">Who pays?</h2></div>
      <p class="sub" style="margin-top:4px">${host ? 'You’re proposing' : `${esc(P(S.host).name)} proposes`} a round for the bill. Everyone hides 0–3 coins in a fist and guesses the total. Furthest from the real total pays the parts of everyone who plays.</p>
      <p class="gfine">${ic('lock', 14)}Moves are sealed on Stellar before anyone opens theirs, so nobody can wait, cheat or back out. The contract only decides who pays; the money still goes wallet to wallet.</p>
      <div class="ganswers">${S.order.map(id => `<span class="gans ${g.answers[id] === true ? 'yes' : g.answers[id] === false ? 'no' : ''}">${av(id, 26)}<small>${g.answers[id] === true ? 'in' : g.answers[id] === false ? 'out' : '…'}</small></span>`).join('')}</div>
      ${mine === undefined ? `<button class="btn primary" type="button" data-g="in">${ic('fist', 20)}I’m in</button><button class="btn ghost" type="button" data-g="out">I’ll just pay my part</button>`
        : `<p class="gstate">${mine ? `You’re in.${host ? '' : ` Waiting for ${esc(P(S.host).name)} to start.`}` : 'You’re out: you pay your own part.'} <button type="button" class="link" data-g="${mine ? 'out' : 'in'}">${mine ? 'Change my mind' : 'Join after all'}</button></p>${host ? '' : `<button class="btn ghost sm" type="button" data-g="hide">Keep choosing meanwhile</button>`}`}
      ${host ? `<button class="btn primary" type="button" data-g="start" ${yes.length < 2 ? 'disabled' : ''}>${yes.length < 2 ? 'Waiting for two to be in' : `Start with ${yes.length}${ic('chev')}`}</button><button class="btn ghost sm" type="button" data-g="off">Call it off</button>` : ''}` };
  }
  if (g.status === 'sealing') {
    if (!inRound()) return bystander(g, m);
    if (!g.sealed[me]) {
      const n = g.players.length, coins = Math.min(3, Math.max(0, m.coins ?? 0)), guess = Math.min(3 * n, Math.max(0, m.guess ?? n));
      return { key: `move:${coins}:${guess}`, kind: 'sheet', html: `
        <div class="gh">${ic('fist', 26)}<h2 class="t-xl">Your move</h2></div>
        <p class="sub" style="margin-top:4px">${n} playing · ${3 * n} coins at most on the table. Nobody sees this until everyone has sealed.</p>
        <div class="gpick"><span class="label">Coins in your fist</span><div class="gstep"><button type="button" data-g="coins" data-d="-1" aria-label="One coin less" ${coins === 0 ? 'disabled' : ''}>−</button><b class="gcoins">${coinsDots(coins)}<span>${coins}</span></b><button type="button" data-g="coins" data-d="1" aria-label="One coin more" ${coins === 3 ? 'disabled' : ''}>+</button></div></div>
        <div class="gpick"><span class="label">Your call: coins on the table</span><div class="gstep"><button type="button" data-g="guess" data-d="-1" aria-label="Guess one less" ${guess === 0 ? 'disabled' : ''}>−</button><b class="gguess">${guess}</b><button type="button" data-g="guess" data-d="1" aria-label="Guess one more" ${guess === 3 * n ? 'disabled' : ''}>+</button></div></div>
        <button class="btn primary" type="button" data-g="seal">${ic('lock', 20)}Seal my move</button>
        <p class="gfine">${ic('lock', 14)}Signed with a key that only this phone has, then sealed on Stellar. Keep this page open: your phone opens the move for you when everyone has sealed.</p>` };
    }
    const waiting = g.players.filter(id => !g.sealed[id]);
    return { key: `sealed:${waiting.join()}:${g.sealed[me].tx || ''}:${g.error || ''}`, kind: 'sheet', html: `
      <div class="gh">${ic('lock', 26)}<h2 class="t-xl">Sealed</h2></div>
      <p class="sub" style="margin-top:4px">${waiting.length ? `Waiting for ${waiting.map(id => P(id).name).join(', ')} to seal.` : 'Everyone has sealed. Opening the moves…'}</p>
      ${roundPlayersList(g)}
      <p class="gfine">${g.sealed[me].tx ? `${ic('check', 14)}Your seal is on Stellar. ${txA(g.sealed[me].tx)}` : `<span class="spin"></span>Sending your seal to Stellar…`}</p>
      ${errBox(g, host)}
      ${host && waiting.length ? `<button class="btn ghost sm" type="button" data-g="close">Open without ${waiting.length === 1 ? P(waiting[0]).name : 'them'}</button><p class="note">Whoever hasn’t sealed just pays their own part.</p>` : ''}` };
  }
  if (g.status === 'opening') {
    if (!activeInRound()) return bystander(g, m);
    const silent = roundPlayers().filter(id => !g.opened[id]);
    return { key: `opening:${silent.join()}:${JSON.stringify(g.opened)}:${g.error || ''}:${m.opened ? 1 : 0}`, kind: 'sheet', html: `
      <div class="gh">${ic('fist', 26)}<h2 class="t-xl">Opening</h2></div>
      <p class="sub" style="margin-top:4px">${silent.length ? `Waiting for ${silent.map(id => (id === me ? 'you' : P(id).name)).join(', ')} to open.` : 'All open. The contract is settling…'}</p>
      ${roundPlayersList(g, { moves: true })}
      <p class="gfine">${g.opened[me] ? `${ic('check', 14)}Your move is open${g.opened[me].tx ? ` on Stellar. ${txA(g.opened[me].tx)}` : '…'}` : m.opened ? `<span class="spin"></span>Opening your move…` : `<span class="spin"></span>Your phone opens your move now…`}</p>
      ${errBox(g, host)}
      <p class="note">Whoever doesn’t open in time loses. The last move to open settles the round.</p>` };
  }
  if (g.status === 'done' && g.outcome) {
    if (m.seen === g.id) return null;
    const L = g.outcome.loser;
    return { key: `done`, kind: 'sheet', html: `
      <div class="gres"><span class="label">Who pays</span><h2 class="t-xxl">${L === me ? 'You pay' : `${esc(P(L).name)} pays`}</h2><p class="sub">${esc(roundOutcomeText(g, me))}</p></div>
      ${roundPlayersList(g, { moves: true })}
      <p class="gfine">${ic('check', 14)}Decided by the contract, not by us. ${txA(g.txs.settle && g.txs.settle.tx)}</p>
      <button class="btn primary" type="button" data-g="ok">${L === me ? 'Fair enough' : 'Nice'}</button>` };
  }
  if (g.status === 'cancelled' && m.seen !== g.id) { gsave({ ...m, seen: g.id }); UI.toast(`<div><b>The round was called off</b><small>Everyone pays their own part.</small></div>`, 2600); }
  return null;
}
function bystander(g, m) {
  if (m.dismissed === g.status) return null;
  const names = roundPlayers().map(id => P(id).name);
  return { key: `bar:${g.status}`, kind: 'bar', html: `${ic('fist', 18)}<span><b>A round for the bill is on.</b> ${esc(names.join(', '))} ${g.status === 'sealing' ? 'are sealing their moves' : 'are opening their moves'}. The loser pays their parts; you pay yours.</span><button class="icon-btn" type="button" data-g="hide" aria-label="Hide">${ic('close', 18)}</button>` };
}
const errBox = (g, host) => (g.error ? `<p class="warnbox">Stellar hiccup: ${esc(String(g.error).slice(0, 140))}${host ? ` <button type="button" class="link" data-g="retry">Try again</button>` : ' Trying again…'}</p>` : '');

function gameLayer() {
  const v = roundView(), key = v && `${v.kind}:${v.key}`;
  if (!v) { if (GL) { const old = GL; GL = null; gsap.to(old.el, { opacity: 0, y: 12, duration: D(.22), onComplete: () => old.el.remove() }); } return; }
  if (GL && GL.kind === v.kind) {
    // same sheet, new contents: swap them in place (no flicker, nothing detaches under a finger)
    if (GL.key !== key) { GL.key = key; if (v.kind === 'bar') GL.el.innerHTML = v.html; else $('.sheet', GL.el).innerHTML = `<div class="grab"></div>${v.html}`; }
    return;
  }
  if (GL) { GL.el.remove(); GL = null; }
  const el = v.kind === 'bar'
    ? h(`<div class="gbar">${v.html}</div>`)
    : h(`<div class="sheet-wrap glayer"><div class="sheet-dim"></div><div class="sheet game" role="dialog" aria-label="Who pays?"><div class="grab"></div>${v.html}</div></div>`);
  GL = { el, key, kind: v.kind };
  UI.root.insertBefore(el, UI.toasts);
  if (v.kind === 'bar') gsap.from(el, { y: -20, opacity: 0, duration: D(.35), ease: 'power2.out' });
  else { gsap.from($('.sheet-dim', el), { opacity: 0, duration: D(.3) }); gsap.from($('.sheet', el), { yPercent: 110, duration: D(.5), ease: 'power3.out' }); }
  el.addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) { e.preventDefault(); gameAct(b.dataset.g, b); } });
}
async function gameAct(what, b) {
  const g = S.game, m = gmem() || {};
  try {
    if (what === 'in') { const k = myRoundKey(); busy(b, true); await act('gameAnswer', { yes: true, pk: k.pk }); }
    else if (what === 'out') { busy(b, true); await act('gameAnswer', { yes: false }); if (!isHost()) { gsave({ ...gmem(), dismissed: 'invite' }); gameLayer(); } }
    else if (what === 'start') { busy(b, true, 'Starting on Stellar'); await act('gameStart'); }
    else if (what === 'off') { busy(b, true); await act('gameCancel'); }
    else if (what === 'hide') { gsave({ ...m, dismissed: g.status }); gameLayer(); }
    else if (what === 'coins' || what === 'guess') {
      const n = g.players.length, lim = what === 'coins' ? 3 : 3 * n, cur = what === 'coins' ? (m.coins ?? 0) : (m.guess ?? n);
      gsave({ ...m, [what]: Math.max(0, Math.min(lim, cur + Number(b.dataset.d))) }); gameLayer();
    }
    else if (what === 'seal') {
      const k = myRoundKey(), n = g.players.length, coins = Math.min(3, Math.max(0, m.coins ?? 0)), guess = Math.min(3 * n, Math.max(0, m.guess ?? n));
      busy(b, true, 'Sealing');
      const salt = m.salt ? unhex(m.salt) : randomBytes(32);
      const c = await commitmentOf(unhex(g.id), unhex(k.pk), coins, guess, salt);
      const sig = ed.sign(sealMessage(unhex(g.id), c), unhex(k.priv));
      gsave({ ...m, coins, guess, salt: hex(salt), commitment: hex(c) });
      await act('gameSeal', { commitment: hex(c), sig: hex(sig) });
      gsave({ ...gmem(), sealed: true });
    }
    else if (what === 'close') { busy(b, true, 'Closing on Stellar'); await act('gameClose'); }
    else if (what === 'retry') { await act('gameRetry'); }
    else if (what === 'ok') { gsave({ ...m, seen: g.id }); gameLayer(); }
  } catch (e) { busy(b, false); }
}
// Opens my sealed move as soon as the round is in its opening phase (once).
async function autoOpen() {
  const g = S && S.game, m = gmem();
  if (!g || g.status !== 'opening' || !activeInRound() || !m || !m.sealed || m.opened || g.opened[ME.pid]) return;
  if (m.commitment !== (g.sealed[ME.pid] || {}).commitment) return; // sealed from another phone
  gsave({ ...m, opened: true });
  try { await act('gameOpen', { coins: m.coins, guess: m.guess, salt: m.salt }); }
  catch (e) { gsave({ ...gmem(), opened: false }); later(4000, autoOpen); }
}
on('state', () => { if (CODE && S) { autoOpen(); gameLayer(); } });
on('game', d => {
  const g = S.game; if (!g) return;
  if (g.status === 'invite' && (!d.from || d.from.status !== 'invite') && !isHost()) UI.toast(`${ic('fist', 20)}<div><b>${esc(P(S.host).name)} proposes a round for the bill</b><small>Hidden coins, sealed on Stellar. In or out?</small></div>`, 3200);
  if (g.status === 'done' && d.from && d.from.status !== 'done' && g.outcome && !inRound()) UI.toast(`${av(g.outcome.loser, 30)}<div><b>${esc(P(g.outcome.loser).name)} pays for the round</b><small>${esc(roundOutcomeText(g, ME && ME.pid))}</small></div>`, 4200);
});

// The round, kept with the night.
function roundCard() {
  const g = S.game; if (!g || g.status !== 'done' || !g.outcome) return '';
  const L = g.outcome.loser;
  return `<h2 class="h2">The round</h2><div class="gcard"><p><b>${esc(P(L).name)} paid for ${esc(roundNames(L) || 'the round')}.</b> ${esc(roundOutcomeText(g, null))}</p>${roundPlayersList(g, { moves: true })}<p class="note">Moves were sealed and opened on Stellar; the contract decided. ${txA(g.txs.settle && g.txs.settle.tx)}</p></div>`;
}

/* ---------- guest: off the hook after the round ---------- */
SCREENS.free = {
  render() {
    const L = roundLoser(), s = shares(S), me = ME.pid, mine = (s.items[me] || 0) + (s.leftShare[me] || 0) + (s.tip[me] || 0);
    return h(`<section>
      <header class="scr-head"><span class="urlbar">${ic('lock', 13)}${esc(location.host)}/t/${esc(S.code)}</span></header>
      <div class="scr-body paid-body">
        <div class="okbadge">${ic('fist', 30)}</div>
        <div class="paid-h"><h1 class="t-xl">${esc(P(L).name)} pays for you</h1><p class="sub">${eur(mine)} · ${esc(roundOutcomeText(S.game, me))}</p></div>
        <div class="yours"><div class="yours-rc"></div><div class="yours-stamp">${stampSVG('ON ' + esc(P(L).name).toUpperCase().slice(0, 16))}</div></div>
        <div class="progress-line"><span class="avs"></span><span class="pl-t"></span></div>
        ${keepCard()}
        <p class="note">${txA(S.game.txs.settle && S.game.txs.settle.tx, 'See the round on Stellar')}${signedIn() ? ' This night is in your profile.' : ' This night stays on this phone.'}</p>
      </div>
      <footer class="scr-foot"><button class="btn primary" type="button" data-act="night" ${S.phase === 'settled' ? '' : 'disabled'}>${S.phase === 'settled' ? `See the night${ic('chev')}` : 'Waiting for the others'}</button></footer>
    </section>`);
  },
  enter(ctx) {
    $('.yours-rc', ctx.el).appendChild(YourPart(ME.pid));
    gsap.set($('.yours-stamp', ctx.el), { opacity: 1, rotation: -9 });
    if (!RM) { gsap.from($('.okbadge', ctx.el), { scale: 0, rotation: -30, duration: .6, ease: 'back.out(2.4)' }); gsap.from($$('.paid-h > *, .yours, .progress-line, .note', ctx.el), { y: 18, opacity: 0, duration: .5, stagger: .07, ease: 'power3.out', delay: .15 }); }
    const upd = () => {
      const sh = shares(S), owing = S.order.filter(id => id !== S.host && sh.total[id] > 0), n = owing.filter(id => S.paid[id] && S.paid[id].confirmed).length;
      $('.progress-line .avs', ctx.el).innerHTML = owing.map(id => av(id, 24, S.paid[id] && S.paid[id].confirmed ? '' : 'off')).join('');
      $('.pl-t', ctx.el).innerHTML = S.phase === 'settled' ? '<b>Everyone’s quits.</b>' : `<b>${n} of ${owing.length}</b> paid ${esc(P(S.host).name)} back`;
      const b = $('[data-act=night]', ctx.el); if (S.phase === 'settled') { b.disabled = false; b.innerHTML = `See the night${ic('chev')}`; }
    };
    upd();
    on('paid', upd, ctx.bag); on('phase', upd, ctx.bag);
    keepButton(ctx, () => UI.go('free', { dir: 'none' }));
  },
  act: { night() { nav(`/t/${S.code}?night`); } },
};

/* ================= routing ================= */
function targetScreen() {
  const s = S, me = meIn() ? ME.pid : null;
  if (new URLSearchParams(location.search).has('night')) return 'memory';
  if (!me) return tableOpen() ? 'join' : s.phase === 'settled' ? 'memory' : 'closed';
  if (me === s.host) return s.phase === 'open' ? 'invite' : s.phase === 'scanning' ? 'receipt' : 'live';
  if (s.phase === 'open' || s.phase === 'scanning') return 'wait';
  if (s.phase === 'claiming') return 'claim';
  if (s.phase === 'settling') return gameFree(s, me) ? 'free' : s.paid[me] ? 'paid' : 'claim';
  return gameFree(s, me) ? 'free' : 'paid';
}
function routeTable(force) {
  if (!S) return;
  const t = targetScreen(), cur = UI.cur && UI.cur.name;
  if (!force) {
    if (cur === t) return;
    if (cur === 'pay' && t === 'claim' && S.phase === 'settling') return;
    if (cur === 'memory' || cur === 'profile' || cur === 'friends') return;
  }
  const dir = { claim: 'up', live: 'fwd', paid: 'fade', free: 'fade', memory: 'fade' }[t] || 'fwd';
  UI.go(t, { dir: UI.cur ? dir : 'none' });
}
on('phase', () => { if (CODE) routeTable(false); });

async function openTable(code) {
  if (CODE !== code) { disconnect(); S = null; }
  CODE = code; ME = credsFor(code);
  if (!S) {
    try {
      const j = await api(`/t/${code}/state`, null, ME);
      if (j.me && (!ME || ME.pid !== j.me)) { ME = { pid: j.me, token: '' }; LS.set('t:' + code, ME); }
      applyState(j.s);
    }
    catch (e) { CODE = null; UI.go('notfound', { dir: 'none', text: e.status === 404 ? 'Check the link or scan the QR again.' : e.message }); return; }
  }
  if (ME && !S.people[ME.pid]) ME = null;
  connect(code);
  routeTable(true);
}
function route() {
  const p = location.pathname;
  let m;
  if (p === '/privacy') return UI.go('privacy');
  if ((m = /^\/(?:t|n)\/([A-Za-z0-9]{4,10})\/?$/.exec(p))) {
    if (p.startsWith('/n/')) { history.replaceState({}, '', `/t/${m[1].toUpperCase()}?night`); }
    return openTable(m[1].toUpperCase());
  }
  if (CODE) { disconnect(); CODE = null; S = null; }
  if (p === '/' || p === '') {
    const fresh = accounts() ? !signedIn() : !LS.get('welcomed', 0) && !nights().length;
    return UI.go(fresh ? 'welcome' : 'home', { dir: UI.cur ? 'back' : 'none' });
  }
  if (accounts() && !signedIn()) { history.replaceState({}, '', '/'); return route(); }
  if (p === '/new') { const to = openTablePath(); if (to !== '/new') { history.replaceState({}, '', to); return route(); } return UI.go('snap'); }
  if (p === '/invite') return UI.go('code');
  if (p === '/me') return UI.go('profile');
  if (p === '/friends') return UI.go('friends');
  UI.go('notfound', { title: 'Nothing here', text: 'This page doesn’t exist.' });
}
window.addEventListener('popstate', () => route());

/* ================= boot ================= */
async function boot() {
  UI.root = $('#app'); UI.toasts = $('.toasts', UI.root);
  try { HEALTH = await (await fetch('/api/health')).json(); } catch (e) { /* offline: keep defaults */ }
  if (accounts() && SESSION) await loadMe();
  if (HEALTH.authTest) window.__quitsLogin = cred => signIn(cred);
  $('.boot', UI.root)?.remove();
  route();
}
boot();
