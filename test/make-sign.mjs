// Renders a photo of a restaurant sign, for testing the place-name reader.
import { chromium } from 'playwright';
const html = `<!doctype html><html><body style="margin:0;width:1200px;height:900px;overflow:hidden;background:linear-gradient(180deg,#8fb3cf,#d9c9a8 55%,#7a6a58)">
<div style="position:absolute;left:120px;top:140px;width:960px;height:300px;background:#123d2c;border:14px solid #c9a24a;border-radius:10px;box-shadow:0 30px 60px rgba(0,0,0,.5);transform:perspective(1200px) rotateY(-14deg) rotateZ(-2deg);display:grid;place-items:center">
<div style="font:700 92px/1 Georgia,serif;color:#e8c766;letter-spacing:2px;text-shadow:0 3px 0 #6b5220">O Cantinho do Beato</div>
<div style="position:absolute;bottom:26px;font:600 30px/1 Georgia,serif;color:#e8c766;letter-spacing:8px">RESTAURANTE · DESDE 1987</div></div>
<div style="position:absolute;left:0;right:0;top:520px;bottom:0;background:repeating-linear-gradient(90deg,#efe6d4 0 120px,#e2d6bf 120px 240px)"></div>
<div style="position:absolute;left:180px;top:560px;width:300px;height:340px;background:#2b2b2b;border:10px solid #5a3b22"></div>
<div style="position:absolute;left:640px;top:580px;width:380px;height:220px;background:#a9c6d8;border:10px solid #5a3b22;opacity:.9"></div>
</body></html>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
await p.setContent(html); await p.screenshot({ path: new URL('./fixtures/sign.jpg', import.meta.url).pathname, type: 'jpeg', quality: 85 }); await b.close();
