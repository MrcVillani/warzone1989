// Misura dei fotogrammi al secondo durante una battaglia con molti mezzi, su telefono e computer simulati.
// Solo informativa (in headless i numeri dipendono dalla macchina): non fa fallire nulla.
// La battaglia usa le armi miste della fase B (100 mezzi per lato) e la qualità degli effetti automatica: per ogni
// prova si riporta anche il livello di qualità (alta, media, bassa) a fine misura e il tempo passato in ciascuno.
// Uso: npm run build && node tests/e2e/prestazioni.mjs
//   MEZZI=200 SECONDI=8   mezzi in campo (metà per lato) e durata della misura
//   CPU=4                 CPU 4 volte più lenta (telefono di fascia media)
//   PROFILI=telefono,telefono-orizzontale   solo questi profili;  RIDUCI=0  salta la prova con «riduci movimento»
//   MUSICA=comando-direttorio   la stessa battaglia con la musica di una missione (id della missione, piano 06):
//                               si imposta solo S.mission, che il client legge per il profilo musicale
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
const N = +process.env.MEZZI || 200, SECS = +process.env.SECONDI || 8;
// CPU=4 rallenta la CPU di 4 volte (come un telefono di fascia media), tramite il protocollo di Chromium.
const CPU = +process.env.CPU || 1;
const MUSIC = process.env.MUSICA || null;

const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const profiles = [
  ['telefono', devices['Pixel 7']],
  ['telefono-orizzontale', landscape],
  ['desktop', { viewport: { width: 1280, height: 800 } }],
];
const only = process.env.PROFILI ? process.env.PROFILI.split(',') : null;
const modes = process.env.RIDUCI === '0' ? ['no-preference'] : ['no-preference', 'reduce'];
// Armi della fase B, mescolate con quelle di prima; telai e propulsioni di tutti i livelli.
const WS = ['MG', 'HMG', 'CN', 'FL', 'RP', 'CN75', 'RK', 'AT', 'MO', 'CN105', 'HW', 'MRL'];
const CS = ['L', 'M', 'H', 'X'], PS = ['W', 'HT', 'T', 'TR'];
const browser = await chromium.launch();
for (const [name, opts] of profiles.filter(([n]) => !only || only.includes(n))) {
  for (const rm of modes) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: rm });
    const page = await ctx.newPage();
    if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => { try { localStorage.removeItem('wz.effetti'); } catch (e) { /* niente */ } });
    await page.reload(); await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    // Due schieramenti di N/2 mezzi (10 righe per lato) a 8 caselle, al centro della visuale, con armi miste.
    const setup = await page.evaluate(([n, WS, CS, PS]) => {
      const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
      E.newGame('normale', 4242); W.fxs.pings.length = 0;
      for (const s of [0, 1]) for (const t of E.TECH) E.S.tech[s][t.id] = true;
      for (let y = 16; y < 48; y++) for (let x = 12; x < 52; x++) E.explored[x + y * E.MW] = 1;
      for (let i = 0; i < n; i++) {
        const side = i % 2, k = i >> 1, row = k % 10, col = Math.floor(k / 10);
        const f = E.nearestFree(side ? 36 + col : 27 - col, 27 + row, false);
        E.makeUnit(side, { c: CS[Math.floor(k / 12) % 4], p: PS[(k + Math.floor(k / 12)) % 4], w: WS[k % WS.length] }, (f[0] + 0.5) * T, (f[1] + 0.5) * T);
      }
      E.updateFog();
      W.cam.x = 32 * T - cv.clientWidth / W.cam.z / 2; W.cam.y = 32 * T - cv.clientHeight / W.cam.z / 2;
      W.ui.paused = false;
      return { units: E.S.ents.filter(e => e.kind === 'unit' && !e.dead).length, z: W.cam.z, q0: W.fxq().level };
    }, [N, WS, CS, PS]);
    // Musica della missione richiesta (o quella della schermaglia): profilo attivo entro mezzo secondo.
    await page.evaluate(id => { window.__wz.engine.S.mission = id; }, MUSIC);
    await page.waitForFunction(id => window.__wz.music().profile === id, MUSIC, { timeout: 3000 }).catch(() => {});
    const mu0 = await page.evaluate(() => window.__wz.music());
    // Conteggio dei fotogrammi con requestAnimationFrame, per secondo, e il fotogramma più lungo.
    const r = await page.evaluate(secs => new Promise(res => {
      const W = window.__wz, t0 = performance.now(), per = [], dts = [];
      let last = t0, cnt = 0, sec = t0, maxParts = 0;
      const inLevel = { alta: 0, media: 0, bassa: 0 }, path = [W.fxq().level];
      const f = now => {
        const lv = W.fxq().level; inLevel[lv] += (now - last) / 1000; if (path[path.length - 1] !== lv) path.push(lv);
        dts.push(now - last); last = now; cnt++;
        maxParts = Math.max(maxParts, W.fxs.parts.length);
        if (now - sec >= 1000) { per.push(cnt * 1000 / (now - sec)); cnt = 0; sec = now; }
        if (now - t0 < secs * 1000) requestAnimationFrame(f);
        else {
          dts.sort((a, b) => a - b);
          res({ fps: per, p95: dts[Math.floor(dts.length * 0.95)], max: dts[dts.length - 1], maxParts, alive: W.engine.S.ents.filter(e => e.kind === 'unit' && !e.dead).length, q: W.fxq(), inLevel, path });
        }
      };
      requestAnimationFrame(f);
    }), SECS);
    const mu = await page.evaluate(() => window.__wz.music());
    const avg = r.fps.reduce((a, b) => a + b, 0) / r.fps.length;
    console.log(`${CPU > 1 ? `CPU÷${CPU} ` : ''}${name.padEnd(21)} ${rm === 'reduce' ? 'riduci movimento' : 'normale         '}  mezzi ${setup.units} → ${r.alive}  ` +
      `fps medi ${avg.toFixed(1)} (min ${Math.min(...r.fps).toFixed(1)}, max ${Math.max(...r.fps).toFixed(1)})  ` +
      `fotogramma p95 ${r.p95.toFixed(1)} ms, peggiore ${r.max.toFixed(1)} ms  particelle max ${r.maxParts}  ` +
      `qualità ${r.path.join(' → ')} (alta ${r.inLevel.alta.toFixed(1)} s, media ${r.inLevel.media.toFixed(1)} s, bassa ${r.inLevel.bassa.toFixed(1)} s; media fotogramma ${r.q.avg} ms)  musica ${mu.profile ?? 'di base'} (${mu.key}, ${mu.bpm}), ${mu.state}, note ${(mu.played || 0) - (mu0.played || 0)}, scartate ${(mu.dropped || 0) - (mu0.dropped || 0)}${errors.length ? '  ERRORI: ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}
await browser.close();
