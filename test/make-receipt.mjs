// Renders a realistic photo of a Portuguese restaurant receipt on a table, for testing the receipt reader.
import { chromium } from 'playwright';
const L = [
  [4, 'COUVERT', 1.75], [1, 'AMEIJOAS BULHAO PATO', 18.50], [1, 'POLVO A LAGAREIRO', 23.90], [1, 'BACALHAU A BRAS', 15.50],
  [1, 'ARROZ DE MARISCO 2P', 36.00], [1, 'SALADA MISTA', 6.50], [2, 'VINHO VERDE GARRAFA', 16.00], [3, 'IMPERIAL', 2.80],
  [2, 'AGUA C/ GAS 0,5L', 2.20], [4, 'PASTEL DE NATA', 1.60], [4, 'BICA', 1.10],
];
const fmt = n => n.toFixed(2).replace('.', ',');
const total = L.reduce((a, [q, , p]) => a + q * p, 0);
const rows = L.map(([q, n, p]) => `<div class="r"><span class="q">${q}</span><span class="n">${n}</span><span class="u">${fmt(p)}</span><span class="t">${fmt(q * p)}</span></div>`).join('');
const html = `<!doctype html><html><head><style>
body{margin:0;width:1200px;height:1600px;overflow:hidden;background:
 radial-gradient(120% 90% at 40% 30%, rgba(255,210,150,.25), rgba(0,0,0,.55)),
 repeating-linear-gradient(92deg,#5b3a22 0 18px,#6a4428 18px 31px,#4f321d 31px 44px,#64412a 44px 70px);}
.wrap{position:absolute;left:250px;top:90px;transform:perspective(1800px) rotateX(9deg) rotateZ(-4deg);filter:drop-shadow(18px 30px 26px rgba(0,0,0,.55))}
.paper{width:660px;padding:46px 40px 60px;background:linear-gradient(180deg,#f4f1e8,#ece8dc 60%,#f2efe6);font:600 25px/1.42 "DejaVu Sans Mono",monospace;color:#2a2a2e;letter-spacing:.5px}
.c{text-align:center}.big{font-size:34px;font-weight:800;letter-spacing:3px}
.rule{border-top:3px dashed #555;margin:14px 0}
.r{display:flex;gap:10px}.q{width:34px}.n{flex:1}.u{width:96px;text-align:right}.t{width:110px;text-align:right}
.tot{display:flex;font-size:34px;font-weight:800;margin-top:6px}.tot span:first-child{flex:1}
.small{font-size:20px;color:#444}
</style></head><body><div class="wrap"><div class="paper">
<div class="c big">O CANTINHO DO BEATO</div>
<div class="c small">Restaurante · Rua do Grilo 102 · 1950-145 Lisboa<br>NIF 513 774 210 · Tel 21 868 4421</div>
<div class="rule"></div>
<div class="small">FATURA SIMPLIFICADA FS 2026/4817<br>24-10-2026 22:47 · MESA 12 · Op: RITA</div>
<div class="rule"></div>
<div class="r small"><span class="q">Qt</span><span class="n">Artigo</span><span class="u">P.Unit</span><span class="t">Total</span></div>
${rows}
<div class="rule"></div>
<div class="tot"><span>TOTAL EUR</span><span>${fmt(total)}</span></div>
<div class="r small" style="margin-top:8px"><span class="n">IVA 13% incl.</span><span class="t">${fmt(total - total / 1.13)}</span></div>
<div class="r small"><span class="n">Multibanco</span><span class="t">${fmt(total)}</span></div>
<div class="rule"></div>
<div class="c small">Obrigado pela preferencia!<br>Processado por programa certificado n. 2231/AT</div>
</div></div></body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 1600 } });
await p.setContent(html); await p.screenshot({ path: new URL('./fixtures/receipt.jpg', import.meta.url).pathname, type: 'jpeg', quality: 85 });
await b.close(); console.log('lines', L.length, 'total', total.toFixed(2));
