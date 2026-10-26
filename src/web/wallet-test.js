// /wc-test: finds out which link makes a phone's wallet app (LOBSTR) pick up a WalletConnect pairing.
// One pairing URI, several ways to open it; whichever brings the connection prompt in the wallet wins.
// Loaded on demand, only from that page. Not linked from anywhere.
import { SignClient } from '@walletconnect/sign-client';
import qrcode from 'qrcode-generator';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const links = uri => [
  ['A · lobstr://wc?uri= (what AppKit does)', `lobstr://wc?uri=${enc(uri)}`],
  ['B · https://lobstr.co/uni/wc?uri=', `https://lobstr.co/uni/wc?uri=${enc(uri)}`],
  ['C · https://lobstr.co/univ2/wc?uri=', `https://lobstr.co/univ2/wc?uri=${enc(uri)}`],
  ['D · the wc: link itself', uri],
  ['E · lobstr://wc?uri= (not encoded)', `lobstr://wc?uri=${uri}`],
  ['F · https://lobstr.co/univ2/wc/?uri=', `https://lobstr.co/univ2/wc/?uri=${enc(uri)}`],
  ['G · lobstr://wcv2?uri=', `lobstr://wcv2?uri=${enc(uri)}`],
  ['H · https://lobstr.co/uni/wc/?uri=', `https://lobstr.co/uni/wc/?uri=${enc(uri)}`],
];

// SEP-7 payment links: does LOBSTR open its Send screen prefilled from any of these? (0.01 XLM to Quits's relay account; nothing is sent unless confirmed in the wallet.)
const RELAY = 'GBCLXIKXD7SKSCNT6MXZY2WOOVQBEI7T4O3NOCWG2BB5FC5QGOSNFF4U';
const sep7 = `web+stellar:pay?destination=${RELAY}&amount=0.01&memo=${enc('QUITS TEST')}&memo_type=MEMO_TEXT`;
const q = sep7.slice('web+stellar:pay'.length); // ?destination=…
const payLinks = [
  ['P · https://lobstr.co/univ2/pay?…', `https://lobstr.co/univ2/pay${q}`],
  ['Q · https://lobstr.co/uni/pay?…', `https://lobstr.co/uni/pay${q}`],
  ['R · web+stellar:pay?… (SEP-7 itself)', sep7],
  ['S · lobstr://pay?…', `lobstr://pay${q}`],
  ['T · https://lobstr.co/univ2/?uri=<SEP-7>', `https://lobstr.co/univ2/?uri=${enc(sep7)}`],
  ['U · https://lobstr.co/uni/?uri=<SEP-7>', `https://lobstr.co/uni/?uri=${enc(sep7)}`],
  ['V · https://lobstr.co/univ2/tx?uri=<SEP-7>', `https://lobstr.co/univ2/tx?uri=${enc(sep7)}`],
  ['W · lobstr://sep7?uri=<SEP-7>', `lobstr://sep7?uri=${enc(sep7)}`],
];

export async function run(el, health, network) {
  const out = el.querySelector('.wct');
  const say = (html) => { out.innerHTML = html; };
  const pay = el.querySelector('.wct-pay');
  if (pay) pay.innerHTML = `<p class="sub"><b>Payment links</b> (a prefilled 0.01 XLM payment; nothing moves unless you confirm it in LOBSTR). Which one opens LOBSTR’s Send screen with the amount and memo filled in?</p>
    <div class="wct-links">${payLinks.map(([label, href]) => `<a class="btn ghost" href="${esc(href)}">${esc(label)}</a>`).join('')}</div>`;
  say('<p>Starting WalletConnect…</p>');
  let client;
  try {
    client = await SignClient.init({ projectId: health.wc, metadata: { name: 'Quits', description: 'Split the bill at the table', url: location.origin, icons: [location.origin + '/icon-512.png'] } });
  } catch (e) { say(`<p>Couldn’t start WalletConnect: ${esc(e.message || e)}</p>`); return; }
  const chain = network === 'public' ? 'stellar:pubnet' : 'stellar:testnet';
  const fresh = async () => {
    const { uri, approval } = await client.connect({ requiredNamespaces: { stellar: { methods: ['stellar_signXDR'], chains: [chain], events: [] } } });
    const q = qrcode(0, 'M'); q.addData(uri); q.make();
    say(`<p class="sub">One connection, several ways to open it. Tap one; if LOBSTR asks to connect, approve it and come back: this page will say which one worked. If LOBSTR opens with nothing, come back and tap the next one. The link lasts 5 minutes.</p>
      <div class="wct-links">${links(uri).map(([label, href], i) => `<a class="btn ghost" href="${esc(href)}" data-i="${i}">${esc(label)}</a>`).join('')}</div>
      <p class="sub">Or scan it with another phone:</p><div class="wct-qr">${q.createSvgTag({ scalable: true, margin: 2 })}</div>
      <p class="sub mono" style="word-break:break-all;font-size:11px">${esc(uri)}</p>
      <button class="btn ghost sm" type="button" data-act="copy">Copy the wc: link</button> <button class="btn ghost sm" type="button" data-act="again">New link</button>
      <p class="wct-state"><b>Waiting…</b> tapped: <span class="wct-tapped">none yet</span></p>`);
    const tapped = [];
    out.querySelectorAll('.wct-links a').forEach(a => a.addEventListener('click', () => { tapped.push(a.textContent.slice(0, 1)); out.querySelector('.wct-tapped').textContent = tapped.join(', '); try { localStorage.setItem('quits:wct', JSON.stringify(tapped)); } catch (e) { /* fine */ } }));
    out.querySelector('[data-act=copy]').addEventListener('click', () => navigator.clipboard.writeText(uri).then(() => { out.querySelector('.wct-state b').textContent = 'Copied.'; }, () => {}));
    out.querySelector('[data-act=again]').addEventListener('click', () => fresh().catch(e => say(`<p>${esc(e.message || e)}</p>`)));
    try {
      const session = await approval();
      const acc = session.namespaces.stellar.accounts.map(a => a.split(':')[2]);
      out.querySelector('.wct-state').innerHTML = `<b>Connected: ${esc(acc[0] ? acc[0].slice(0, 6) + '…' + acc[0].slice(-4) : '?')}</b> via ${esc(session.peer.metadata.name)}. Last tapped: <b>${esc(tapped[tapped.length - 1] || '(scanned)')}</b>. Tell Claude that letter.`;
    } catch (e) { out.querySelector('.wct-state').innerHTML = `<b>Not connected:</b> ${esc(e.message || e)} <button class="btn ghost sm" type="button" data-act="again">New link</button>`; out.querySelector('.wct-state [data-act=again]').addEventListener('click', () => fresh()); }
  };
  await fresh();
}
