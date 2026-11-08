// Misura dei fotogrammi al secondo durante una battaglia con molti mezzi, su telefono e computer simulati.
// Solo informativa (in headless i numeri dipendono dalla macchina): non fa fallire nulla.
// Uso: npm run build && node tests/e2e/prestazioni.mjs   (MEZZI=80 SECONDI=8 per cambiare la prova)
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
const N = +process.env.MEZZI || 70, SECS = +process.env.SECONDI || 8;
// CPU=4 rallenta la CPU di 4 volte (come un telefono di fascia media), tramite il protocollo di Chromium.
const CPU = +process.env.CPU || 1;

const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const profiles = [
  ['telefono', devices['Pixel 7']],
  ['telefono-orizzontale', landscape],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
const browser = await chromium.launch();
for (const [name, opts] of profiles) {
  for (const rm of ['no-preference', 'reduce']) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: rm });
    const page = await ctx.newPage();
    if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    // Due schieramenti di N/2 mezzi a 6 caselle, al centro della visuale, con tutte le armi; poi si combatte.
    const setup = await page.evaluate(n => {
      const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
      E.newGame('normale', 4242);
      for (let y = 20; y < 44; y++) for (let x = 20; x < 44; x++) E.explored[x + y * E.MW] = 1;
      const ws = ['MG', 'CN', 'RK', 'MO'], cs = ['L', 'M', 'H'];
      for (let i = 0; i < n; i++) {
        const side = i % 2, k = i >> 1, row = k % 9, col = Math.floor(k / 9);
        const f = E.nearestFree(side ? 36 + col : 27 - col, 28 + row, false);
        E.makeUnit(side, { c: cs[k % 3], p: 'W', w: ws[k % 4] }, (f[0] + 0.5) * T, (f[1] + 0.5) * T);
      }
      E.updateFog();
      W.cam.x = 32 * T - cv.clientWidth / W.cam.z / 2; W.cam.y = 32 * T - cv.clientHeight / W.cam.z / 2;
      W.ui.paused = false;
      return { units: E.S.ents.filter(e => e.kind === 'unit' && !e.dead).length, z: W.cam.z };
    }, N);
    // Conteggio dei fotogrammi con requestAnimationFrame, per secondo, e il fotogramma più lungo.
    const r = await page.evaluate(secs => new Promise(res => {
      const W = window.__wz, t0 = performance.now(), per = [], dts = [];
      let last = t0, cnt = 0, sec = t0, maxParts = 0;
      const f = now => {
        dts.push(now - last); last = now; cnt++;
        maxParts = Math.max(maxParts, W.fxs.parts.length);
        if (now - sec >= 1000) { per.push(cnt * 1000 / (now - sec)); cnt = 0; sec = now; }
        if (now - t0 < secs * 1000) requestAnimationFrame(f);
        else {
          dts.sort((a, b) => a - b);
          res({ fps: per, p95: dts[Math.floor(dts.length * 0.95)], max: dts[dts.length - 1], maxParts, alive: W.engine.S.ents.filter(e => e.kind === 'unit' && !e.dead).length });
        }
      };
      requestAnimationFrame(f);
    }), SECS);
    const avg = r.fps.reduce((a, b) => a + b, 0) / r.fps.length;
    console.log(`${CPU > 1 ? `CPU÷${CPU} ` : ''}${name.padEnd(21)} ${rm === 'reduce' ? 'riduci movimento' : 'normale         '}  mezzi ${setup.units} → ${r.alive}  ` +
      `fps medi ${avg.toFixed(1)} (min ${Math.min(...r.fps).toFixed(1)}, max ${Math.max(...r.fps).toFixed(1)})  ` +
      `fotogramma p95 ${r.p95.toFixed(1)} ms, peggiore ${r.max.toFixed(1)} ms  particelle max ${r.maxParts}${errors.length ? '  ERRORI: ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}
await browser.close();
