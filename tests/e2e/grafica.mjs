// Nuova grafica «A+» (piano 08) nel browser: nessun errore in partita su computer e telefono (mappa casuale e Latina, a
// ogni livello di qualità), qualità automatica che con 200 mezzi su telefono lento scende fino a «minima», scossa
// spenta da «Comandi» → «Scossa», da «riduci movimento» e dalla grafica minima, notte solo nella missione 1, terreno
// cotto anche senza Web Worker (ripiego sul filo principale) e l'elenco «N selezionati» che non finisce sotto le schede.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/grafica.mjs
// Lo stato del disegno si legge con window.__wz.gfx() (modo di cottura, pezzi cotti, visuale pronta, notte, livello) e
// window.__wz.fxq() (preferenza e livello della qualità).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { openMenu } from './layoutb.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
const CAMP = 'wz.campagna';

// Pagina nuova in un contesto suo (archivio pulito), con gli errori JavaScript e quelli scritti in console.
async function open(browser, opts, { reducedMotion, init, cpu } = {}) {
  const ctx = await browser.newContext({ ...opts, ...(reducedMotion ? { reducedMotion } : {}) });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  if (cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { ctx, page, errors };
}
async function press(page, touch, sel) {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded();
  if (touch) await l.tap(); else await l.click();
  await page.waitForTimeout(120);
}
// Dal menu principale alla schermaglia sulla mappa indicata, come un giocatore.
async function skirmish(page, touch, map) {
  if (map !== 'casuale') await press(page, touch, `#overlay [data-map="${map}"]`);
  await press(page, touch, '#ovStart');
  await page.waitForFunction(() => !window.__wz.ui.overlay);
}
const waitReady = (page, ms = 10000) => page.waitForFunction(() => window.__wz.gfx().ready, null, { timeout: ms }).then(() => true, () => false);
const errText = errors => errors.length ? ': ' + [...new Set(errors)].slice(0, 5).join(' | ') : '';

// Nella pagina: due schieramenti di n mezzi con armi miste e tutte le ricerche, al centro della visuale.
function battle([n, cx, cy]) {
  const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
  const WS = ['MG', 'HMG', 'CN', 'FL', 'RP', 'CN75', 'RK', 'AT', 'MO', 'CN105', 'HW', 'MRL'], CS = ['L', 'M', 'H', 'X'], PS = ['W', 'HT', 'T', 'TR', 'V'];
  for (const s of [0, 1]) for (const t of E.TECH) E.S.tech[s][t.id] = true;
  for (let y = cy - 16; y < cy + 16; y++) for (let x = cx - 20; x < cx + 20; x++) if (x >= 0 && y >= 0 && x < E.MW && y < E.MH) E.explored[x + y * E.MW] = 1;
  for (let i = 0; i < n; i++) {
    const side = i % 2, k = i >> 1, row = k % 10, col = Math.floor(k / 10);
    const f = E.nearestFree(side ? cx + 4 + col : cx - 5 - col, cy - 5 + row, false);
    if (!f) continue;
    E.makeUnit(side, { c: CS[Math.floor(k / 12) % 4], p: PS[(k + Math.floor(k / 12)) % PS.length], w: WS[k % WS.length].replace(/^(MO|CN105|HW|MRL)$/, w => E.WEAPONS[w] ? w : 'MG') }, (f[0] + 0.5) * T, (f[1] + 0.5) * T);
  }
  E.updateFog();
  W.cam.x = cx * T - cv.clientWidth / W.cam.z / 2; W.cam.y = cy * T - cv.clientHeight / W.cam.z / 2;
  W.ui.paused = false;
  return E.S.ents.filter(e => e.kind === 'unit' && !e.dead).length;
}
// Nella pagina: luminosità media della visuale (0–255), su una griglia di punti della tela. Si misura in tre fotogrammi
// di fila, subito dopo quello del gioco, e si tiene la più alta: un cambio di livello della qualità automatica
// ridimensiona la tela dopo il disegno e la lascia vuota per un fotogramma (problema segnalato al frontend).
async function viewLum() {
  const cv = document.getElementById('view');
  const one = () => {
    const w = 96, h = Math.max(1, Math.round(96 * cv.height / cv.width));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(cv, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4);
  };
  let best = 0;
  for (let i = 0; i < 3; i++) { await new Promise(r => requestAnimationFrame(r)); best = Math.max(best, one()); }
  return best;
}
// Nella pagina: un edificio del giocatore esplode al centro della visuale, n volte; restituisce la scossa massima e
// lo scarto massimo della trasformazione del mondo nel fotogramma dopo (0 = nessuna scossa disegnata).
async function blasts(n = 4) {
  const W = window.__wz, E = W.engine, cv = document.getElementById('view'), g = cv.getContext('2d');
  W.fxs.shake = 0;
  const h = E.homeOf(0);
  let max = 0;
  for (let i = 0; i < n; i++) {
    let spot = null;
    for (let r = 2; r < 12 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if (E.canPlace(0, 'lab', h.x + dx, h.y + dy)) spot = [h.x + dx, h.y + dy];
    if (!spot) break;
    const s = E.makeStruct('lab', 0, spot[0], spot[1], true);
    W.cam.x = s.x - cv.clientWidth / W.cam.z / 2; W.cam.y = s.y - cv.clientHeight / W.cam.z / 2;
    E.updateFog();
    E.kill(s, 1);
    max = Math.max(max, W.fxs.shake);
  }
  const seen = [], orig = g.setTransform.bind(g);
  g.setTransform = (...a) => { seen.push([...a, W.cam.x, W.cam.y]); return orig(...a); };
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  g.setTransform = orig;
  const world = seen.filter(a => a[1] === 0 && a[2] === 0 && a[0] === a[3] && (a[4] !== 0 || a[5] !== 0));
  const off = world.map(a => Math.hypot(a[4] + a[6] * a[0], a[5] + a[7] * a[0]));
  return { max, frames: world.length, off: off.length ? Math.max(...off) : -1 };
}
// «Comandi» dalla partita (su telefono è nel cassetto «Menu»).
async function openHelp(page, touch) {
  await openMenu(page);
  await press(page, touch, '#btnHelp');
  await page.waitForSelector('#ovShake');
}
const shakeUi = page => page.evaluate(() => ({
  text: document.getElementById('ovShake')?.textContent, pressed: document.getElementById('ovShake')?.getAttribute('aria-pressed'),
  note: document.getElementById('ovShakeN')?.textContent || '', saved: localStorage.getItem('wz.scossa'),
}));

export async function runGraphicsChecks({ browser, url, check, todo = check, profiles }) {
  mkdirSync(outDir, { recursive: true });

  // 1. Partita su mappa casuale e su Latina, a ogni livello di qualità, con una battaglia in vista: nessun errore
  //    (né eccezioni né righe d'errore in console), terreno cotto nel worker, visuale pronta.
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    for (const map of ['casuale', 'latina']) {
      const { ctx, page, errors } = await open(browser, opts);
      await page.goto(url); await page.waitForTimeout(400);
      await skirmish(page, touch, map);
      const ready = await waitReady(page);
      const g0 = await page.evaluate(() => ({ ...window.__wz.gfx(), map: window.__wz.S.map }));
      check(ready && g0.mode === 'worker' && g0.baked > 0 && (map === 'casuale' ? g0.map === null : g0.map === map) && !g0.night,
        `${name}, mappa ${map}: terreno cotto nel worker e visuale pronta (modo ${g0.mode}, pezzi ${g0.baked}, mappa ${g0.map}, notte ${g0.night})`);
      const c = await page.evaluate(() => { const h = window.__wz.engine.homeOf(1), b = window.__wz.engine.homeOf(0); return [Math.round((h.x + b.x) / 2), Math.round((h.y + b.y) / 2)]; });
      const n = await page.evaluate(battle, [40, c[0], c[1]]);
      const levels = [];
      for (const lv of ['alta', 'media', 'bassa', 'minima']) {
        await page.evaluate(lv => window.__wz.setFx(lv), lv);
        await page.waitForTimeout(1200);
        levels.push(await page.evaluate(() => window.__wz.gfx().level));
        if (lv === 'alta') await page.screenshot({ path: path.join(outDir, `${name}-grafica-${map}.png`) });
      }
      // qualche minuto di partita IA contro IA, con fotogrammi veri in mezzo
      await page.evaluate(() => { window.__wz.setFx('auto'); window.__wz.S.autoplay = true; });
      for (let i = 0; i < 6; i++) { await page.evaluate(() => { for (let k = 0; k < 400 && window.__wz.S.phase === 'play'; k++) window.__wz.step(0.05); }); await page.waitForTimeout(150); }
      check(levels.join(',') === 'alta,media,bassa,minima', `${name}, mappa ${map}: i quattro livelli di qualità si scelgono e si disegnano (${levels.join(', ')}; ${n} mezzi in campo)`);
      check(errors.length === 0, `${name}, mappa ${map}: nessun errore in console né JavaScript in partita${errText(errors)}`);
      await ctx.close();
    }
  }

  // 2. Qualità automatica con 200 mezzi su telefono simulato (CPU ÷4): con più di 120 mezzi parte da «bassa», poi
  //    la misura la porta fino a «minima». Con la preferenza fissa «alta» invece non cambia.
  {
    const [name, opts] = ['telefono', devices['Pixel 7']];
    const { ctx, page, errors } = await open(browser, opts, { cpu: 4 });
    await page.goto(url); await page.waitForTimeout(500);
    await page.locator('#ovStart').tap();
    await page.waitForFunction(() => !window.__wz.ui.overlay);
    const q0 = await page.evaluate(() => window.__wz.fxq());
    // Sonda dopo ogni fotogramma del gioco (prima che il browser lo mostri): livelli attraversati e fotogrammi in cui
    // la visuale o la minimappa sono vuote (tela appena ridimensionata e non ancora ridisegnata).
    await page.evaluate(() => {
      const cv = document.getElementById('view'), mm = document.getElementById('mini'), g = cv.getContext('2d'), gm = mm.getContext('2d');
      window.__lv = [window.__wz.fxq().level]; window.__blank = { view: 0, mini: 0, frames: 0 };
      const f = () => {
        const l = window.__wz.fxq().level; if (window.__lv[window.__lv.length - 1] !== l) window.__lv.push(l);
        const b = window.__blank; b.frames++;
        if (g.getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data[3] === 0) b.view++;
        if (gm.getImageData(mm.width >> 1, mm.height >> 1, 1, 1).data[3] === 0) b.mini++;
        requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    const n = await page.evaluate(battle, [200, 32, 32]);
    const t0 = Date.now();
    const got = await page.waitForFunction(() => window.__wz.fxq().level === 'minima', null, { timeout: 60000, polling: 250 }).then(() => true, () => false);
    const r = await page.evaluate(() => ({ path: window.__lv, q: window.__wz.fxq(), units: window.__wz.S.ents.filter(e => e.kind === 'unit' && !e.dead).length }));
    check(q0.pref === 'auto' && q0.level === 'alta', `${name} CPU÷4: la qualità parte su «auto», livello alta (${q0.pref}, ${q0.level})`);
    check(r.path[1] === 'bassa', `${name} CPU÷4: con ${n} mezzi in campo la qualità automatica salta subito a «bassa» (livelli ${r.path.join(' → ')})`);
    check(got && r.q.level === 'minima' && r.q.pref === 'auto', `${name} CPU÷4: con 200 mezzi la qualità automatica scende fino a «minima» in ${((Date.now() - t0) / 1000).toFixed(1)} s (livelli ${r.path.join(' → ')}, fotogramma medio ${r.q.avg} ms, mezzi vivi ${r.units})`);
    const bl = await page.evaluate(() => window.__blank);
    todo(bl.view === 0 && bl.mini === 0, `${name} CPU÷4: i cambi di livello non lasciano vuote la visuale o la minimappa per un fotogramma (vuoti: visuale ${bl.view}, minimappa ${bl.mini} su ${bl.frames} fotogrammi; resize() chiamato da frameTick dopo il disegno)`);
    await page.screenshot({ path: path.join(outDir, `${name}-grafica-minima-200.png`) });
    // preferenza fissa: la misura non cambia il livello
    await page.evaluate(() => { window.__wz.setFx('alta'); window.__lv = ['alta']; });
    await page.waitForTimeout(4000);
    const fixed = await page.evaluate(() => ({ path: window.__lv, q: window.__wz.fxq() }));
    check(fixed.q.pref === 'alta' && fixed.path.join() === 'alta', `${name} CPU÷4: con «Alti» fissi il livello resta alta anche se il gioco rallenta (${fixed.path.join(' → ')}, ${fixed.q.avg} ms)`);
    check(errors.length === 0, `${name} CPU÷4: nessun errore con 200 mezzi${errText(errors)}`);
    await ctx.close();
  }

  // 3. Scossa dello schermo: accesa scuote, «Comandi» → «Scossa» la spegne (e lo ricorda), la grafica minima e
  //    «riduci movimento» (anche attivato a partita in corso, con emulateMedia) la tolgono.
  for (const [name, opts] of profiles.slice(0, 2)) {
    const touch = !!opts.hasTouch;
    const { ctx, page, errors } = await open(browser, opts);
    await page.goto(url); await page.waitForTimeout(400);
    await skirmish(page, touch, 'casuale');
    await page.evaluate(() => window.__wz.setFx('alta'));
    const on = await page.evaluate(blasts);
    check(on.max > 0 && on.off > 0, `${name}: con la scossa accesa un edificio che esplode scuote lo schermo (scossa ${on.max.toFixed(2)} px, scarto ${on.off.toFixed(2)} px)`);
    await page.waitForTimeout(800);
    await openHelp(page, touch);
    const u0 = await shakeUi(page);
    await press(page, touch, '#ovShake');
    const u1 = await shakeUi(page);
    check(u0.text === 'Accesa' && u0.pressed === 'true' && u1.text === 'Spenta' && u1.pressed === 'false' && u1.saved === '0',
      `${name}: in «Comandi» la riga «Scossa» passa da «${u0.text}» a «${u1.text}» e si salva (wz.scossa = ${u1.saved})`);
    await press(page, touch, '#ovClose');
    const off = await page.evaluate(blasts);
    check(off.max === 0 && off.frames > 0 && off.off < 1e-6, `${name}: con «Scossa» spenta nessuna scossa (scossa ${off.max}, scarto ${off.off} px su ${off.frames} disegni)`);
    await page.reload(); await page.waitForTimeout(400);
    await skirmish(page, touch, 'casuale');
    await openHelp(page, touch);
    const u2 = await shakeUi(page);
    check(u2.text === 'Spenta', `${name}: «Scossa» spenta resta spenta dopo il ricaricamento («${u2.text}»)`);
    await press(page, touch, '#ovShake'); // di nuovo accesa
    await page.evaluate(() => window.__wz.setFx('minima'));
    await press(page, touch, '#ovShake'); await press(page, touch, '#ovShake'); // aggiorna la nota
    const u3 = await shakeUi(page);
    await press(page, touch, '#ovClose');
    const mini = await page.evaluate(blasts);
    check(u3.text === 'Accesa' && /grafica minima/.test(u3.note) && mini.max === 0 && mini.off < 1e-6,
      `${name}: con la grafica minima nessuna scossa anche se accesa (nota «${u3.note}», scossa ${mini.max})`);
    await page.evaluate(() => window.__wz.setFx('alta'));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rm = await page.evaluate(blasts);
    await openHelp(page, touch);
    const u4 = await shakeUi(page);
    await press(page, touch, '#ovClose');
    check(rm.max === 0 && rm.off < 1e-6 && /riduci movimento/.test(u4.note),
      `${name}: con «riduci movimento» attivato a partita in corso nessuna scossa (scossa ${rm.max}, scarto ${rm.off} px; nota «${u4.note}»)`);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const back = await page.evaluate(blasts);
    check(back.max > 0, `${name}: tolto «riduci movimento» la scossa torna (scossa ${back.max.toFixed(2)} px)`);
    check(errors.length === 0, `${name}: nessun errore nelle prove della scossa${errText(errors)}`);
    await ctx.close();
  }

  // 4. Notte solo nella missione 1: S.night e gfx().night veri e visuale più scura; la missione 2, la schermaglia
  //    su mappa casuale e su Latina sono di giorno. La notte resta più scura anche in «minima» (senza tela della luce).
  for (const [name, opts] of profiles.slice(0, 2)) {
    const touch = !!opts.hasTouch;
    const { ctx, page, errors } = await open(browser, opts);
    await page.goto(url);
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ unlocked: 2, done: ['testa-di-ponte'], tech: {}, best: {} })), CAMP);
    await page.reload(); await page.waitForTimeout(400);
    const res = {};
    for (const i of [0, 1]) {
      await press(page, touch, '#ovMissions');
      await press(page, touch, `#overlay [data-mission="${i}"]`);
      await page.waitForFunction(() => window.__wz.ui.overlay === 'brief');
      await press(page, touch, '#ovGo');
      await page.waitForFunction(() => !window.__wz.ui.overlay);
      await page.evaluate(() => { window.__wz.ui.paused = true; window.__wz.setFx('alta'); });
      await waitReady(page); await page.waitForTimeout(400);
      res[i] = await page.evaluate(() => ({ mission: window.__wz.S.mission, night: window.__wz.S.night, gfx: window.__wz.gfx().night }));
      res[i].lum = await page.evaluate(viewLum);
      if (i === 0) {
        await page.screenshot({ path: path.join(outDir, `${name}-grafica-notte.png`) });
        // la stessa visuale di giorno, per confronto; poi di nuovo di notte a qualità minima, e di giorno
        await page.evaluate(() => { window.__wz.S.night = false; });
        await waitReady(page); await page.waitForTimeout(400);
        res.day = await page.evaluate(viewLum);
        await page.evaluate(() => { window.__wz.S.night = true; window.__wz.setFx('minima'); });
        await waitReady(page); await page.waitForTimeout(400);
        res.nightMin = await page.evaluate(viewLum);
        await page.evaluate(() => { window.__wz.S.night = false; });
        await waitReady(page); await page.waitForTimeout(400);
        res.dayMin = await page.evaluate(viewLum);
        await page.evaluate(() => { window.__wz.S.night = true; window.__wz.setFx('alta'); });
      }
      await openMenu(page);
      await press(page, touch, '#btnExit');
      await press(page, touch, '#ovLeave');
      await page.waitForFunction(() => window.__wz.ui.overlay === 'start');
    }
    const m1 = res[0], m2 = res[1];
    check(m1.mission === 'testa-di-ponte' && m1.night === true && m1.gfx === true, `${name}: la missione 1 è di notte (S.night ${m1.night}, gfx ${m1.gfx})`);
    check(m1.lum < res.day * 0.8, `${name}: di notte la visuale della missione 1 è più scura (luminosità ${m1.lum.toFixed(1)} contro ${res.day.toFixed(1)} di giorno)`);
    check(res.nightMin < res.dayMin * 0.8, `${name}: anche con la grafica minima la notte è più scura (${res.nightMin.toFixed(1)} contro ${res.dayMin.toFixed(1)})`);
    check(m2.mission === 'pozzi-del-guado' && m2.night === false && m2.gfx === false, `${name}: la missione 2 è di giorno (S.night ${m2.night}, gfx ${m2.gfx})`);
    for (const map of ['casuale', 'latina']) {
      await skirmish(page, touch, map);
      const s = await page.evaluate(() => ({ night: window.__wz.S.night, gfx: window.__wz.gfx().night, mission: window.__wz.S.mission }));
      check(s.night === false && s.gfx === false && s.mission === null, `${name}: la schermaglia su mappa ${map} è di giorno (S.night ${s.night}, gfx ${s.gfx})`);
      await openMenu(page);
      await press(page, touch, '#btnExit');
      await press(page, touch, '#ovLeave');
      await page.waitForFunction(() => window.__wz.ui.overlay === 'start');
    }
    check(errors.length === 0, `${name}: nessun errore nelle prove della notte${errText(errors)}`);
    await ctx.close();
  }

  // 5. Ripiego sul filo principale: senza Worker, e con un worker che va in errore, il terreno si cuoce lo stesso.
  const noWorker = () => { Object.defineProperty(window, 'Worker', { value: undefined, configurable: true, writable: true }); };
  const badWorker = () => {
    class Broken { constructor() { setTimeout(() => this.onerror && this.onerror({ preventDefault() {} }), 30); } postMessage() {} terminate() {} }
    Object.defineProperty(window, 'Worker', { value: Broken, configurable: true, writable: true });
  };
  for (const [name, opts] of profiles.slice(0, 2)) {
    const touch = !!opts.hasTouch;
    for (const [kind, init, why] of [['senza Worker', noWorker, /nessun Worker/], ['worker in errore', badWorker, /errore del worker/]]) {
      for (const map of ['casuale', 'latina']) {
        const { ctx, page, errors } = await open(browser, opts, { init });
        await page.goto(url); await page.waitForTimeout(400);
        await skirmish(page, touch, map);
        const ready = await waitReady(page, 15000);
        const lum = await page.evaluate(viewLum);
        // spostando la visuale si cuociono altri pezzi
        await page.evaluate(() => { const W = window.__wz, E = W.engine, h = E.homeOf(1); W.cam.x = h.x * E.TILE - 300; W.cam.y = h.y * E.TILE - 200; });
        const ready2 = await waitReady(page, 15000);
        const g = await page.evaluate(() => window.__wz.gfx());
        check(ready && ready2 && g.mode === 'principale' && why.test(g.why || '') && g.baked > 0 && g.failed === 0 && lum > 25,
          `${name}, ${kind}, mappa ${map}: il terreno si cuoce sul filo principale (modo ${g.mode}, motivo «${g.why}», pezzi ${g.baked}, falliti ${g.failed}, luminosità ${lum.toFixed(0)})`);
        if (map === 'latina' && kind === 'senza Worker') await page.screenshot({ path: path.join(outDir, `${name}-grafica-senza-worker.png`) });
        // la partita va avanti normalmente
        await page.evaluate(() => { for (let k = 0; k < 600; k++) window.__wz.step(0.05); });
        await page.waitForTimeout(300);
        check(errors.length === 0, `${name}, ${kind}, mappa ${map}: nessun errore${errText(errors)}`);
        await ctx.close();
      }
    }
  }

  // 6. Computer: l'elenco «N selezionati» non si sovrappone alle schede del pannello, anche su schermi bassi.
  for (const vp of [{ width: 1280, height: 800 }, { width: 1280, height: 640 }, { width: 1024, height: 600 }]) {
    const name = `desktop ${vp.width}×${vp.height}`;
    const { ctx, page, errors } = await open(browser, { viewport: vp });
    await page.goto(url); await page.waitForTimeout(400);
    await skirmish(page, false, 'casuale');
    const measure = () => page.evaluate(() => {
      const r = el => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right, h: b.height }; };
      const sel = document.getElementById('sel'), tabs = document.getElementById('tabs'), lis = [...sel.querySelectorAll('.comp li')];
      return { sel: r(sel), tabs: r(tabs), last: lis.length ? r(lis[lis.length - 1]) : null, n: lis.length, head: sel.querySelector('.selhead .nm')?.textContent, over: sel.scrollHeight > sel.clientHeight + 1 };
    });
    const k = await page.evaluate(() => {
      const W = window.__wz, E = W.engine, T = E.TILE, h = E.homeOf(0), ids = [];
      const CS = ['L', 'M', 'H', 'X'], PS = ['W', 'HT', 'T'], WS = ['MG', 'HMG', 'CN', 'FL'];
      let i = 0;
      for (const c of CS) for (const p of PS) { const w = WS[i++ % WS.length]; const f = E.nearestFree(h.x + 3 + (i % 5), h.y + 3 + Math.floor(i / 5), false); ids.push(E.makeUnit(0, { c, p, w }, (f[0] + 0.5) * T, (f[1] + 0.5) * T).id); }
      for (const e of E.S.ents) if (e.kind === 'unit' && e.owner === 0 && !e.dead && e.builder) ids.push(e.id);
      W.ui.sel = ids; W.ui.paused = true;
      return ids.length;
    });
    await page.waitForTimeout(500);
    const m = await measure();
    const ok = x => x.last && m.sel.b <= m.tabs.t + 0.5 && x.last.b <= m.tabs.t + 0.5 && x.last.b <= x.sel.b + 0.5 && !x.over;
    check(ok(m) && m.head === `${k} selezionati` && m.n >= 10,
      `${name}: l’elenco «${m.head}» (${m.n} righe) sta sopra le schede (ultima riga fino a y=${m.last && Math.round(m.last.b)}, elenco fino a ${Math.round(m.sel.b)}, schede da ${Math.round(m.tabs.t)})`);
    await page.screenshot({ path: path.join(outDir, `desktop-${vp.width}x${vp.height}-grafica-selezionati.png`) });
    // controprova (solo informativa): con le parti del pannello che si stringono, come prima della correzione, la
    // misura vede la sovrapposizione
    await page.addStyleTag({ content: '#panel > * { flex-shrink: 1 !important; }' });
    await page.waitForTimeout(200);
    const old = await measure();
    console.log(`     (controprova ${name}: con il CSS di prima l’elenco ${ok(old) ? 'resta sopra le schede' : `finisce sotto le schede (ultima riga ${old.last && Math.round(old.last.b)}, schede da ${Math.round(old.tabs.t)})`})`);
    check(errors.length === 0, `${name}: nessun errore con molti mezzi selezionati${errText(errors)}`);
    await ctx.close();
  }
}

// Lancio da solo: node tests/e2e/grafica.mjs (dopo npm run build). E2E_PROFILE=telefono per un solo profilo.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const todo = (ok, msg) => console.log(`${ok ? 'ok  ' : 'TODO'} ${msg}`);
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runGraphicsChecks({ browser, url, check, todo, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della grafica sono passati.');
}
