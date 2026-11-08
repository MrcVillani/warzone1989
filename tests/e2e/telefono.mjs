// Prove della giocabilità su telefono (piano 04) con tocchi veri: gli eventi touch passano dal protocollo di
// Chromium (CDP, Input.dispatchTouchEvent), anche a due dita, e il gioco li riceve come pointer event del dito.
// Su computer: clic, riquadro, rotella e squadre da tastiera invariati.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/telefono.mjs
// Ogni situazione si prepara con window.__wz (nuova partita in pausa, mezzi messi dove serve, camera ferma),
// poi si fa il gesto e si leggono camera, selezione e ordini nello stato del gioco.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Strumenti dentro la pagina: preparano le situazioni e convertono le coordinate del mondo in quelle dello schermo.
function installHelpers() {
  const W = window.__wz, E = W.engine, T = E.TILE;
  const cv = document.getElementById('view');
  const free = (tx, ty) => { const f = E.nearestFree(tx, ty, false); return { tx: f[0], ty: f[1], x: (f[0] + 0.5) * T, y: (f[1] + 0.5) * T }; };
  const vw = () => cv.clientWidth / W.cam.z, vh = () => cv.clientHeight / W.cam.z;
  window.__t = {
    // Nuova partita in pausa, nessuna selezione, nessuna squadra, zoom 1, camera centrata su (cx, cy) in caselle.
    reset(seed, cx = 32, cy = 32) {
      E.newGame('normale', seed);
      Object.assign(W.ui, { sel: [], groups: {}, placing: null, amove: false, paused: true, key: '' });
      W.fxs.shake = 0; W.fxs.boxSel = null; W.cam.z = 1;
      // via gli avvisi e le frecce rimasti dalla prova precedente
      for (const el of document.querySelectorAll('#toasts > *, #arrows > *')) el.remove();
      const c = free(cx, cy);
      this.center(c.x, c.y);
      window.__vib.length = 0;
      return c;
    },
    free,
    center(x, y) { W.cam.x = x - vw() / 2; W.cam.y = y - vh() / 2; },
    cam: () => ({ x: W.cam.x, y: W.cam.y, z: W.cam.z }),
    // Centro della visuale in coordinate del mondo.
    mid: () => ({ x: W.cam.x + vw() / 2, y: W.cam.y + vh() / 2 }),
    view: () => { const r = cv.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    // Porta un mezzo in p e aggiorna la nebbia.
    put(u, p) { u.x = p.x; u.y = p.y; u.gx = p.x; u.gy = p.y; u.path = null; u.order = { t: 'idle' }; u.tgt = 0; E.updateFog(); return u.id; },
    unit(owner, w, p, c = 'L') { const u = E.makeUnit(owner, { c, p: 'W', w }, p.x, p.y); u.order = { t: 'idle' }; E.updateFog(); return u; },
    armed: () => E.S.ents.filter(e => e.kind === 'unit' && e.owner === 0 && !e.dead && !e.builder),
    // Tutti i propri mezzi lontano dalla zona della prova (così non entrano nel riquadro né nell'aggancio).
    clear() { for (const e of E.S.ents) if (e.kind === 'unit' && e.owner === 0 && !e.dead) this.put(e, free(4, 60)); },
    // Punto della pagina corrispondente a un punto del mondo e cosa c'è sopra in quel punto.
    scr(wx, wy) {
      const r = cv.getBoundingClientRect();
      const x = r.left + (wx - W.cam.x) * W.cam.z, y = r.top + (wy - W.cam.y) * W.cam.z;
      const el = document.elementFromPoint(x, y);
      return { x, y, onMap: el === cv, under: el ? (el.id || el.className || el.tagName) : null };
    },
    ent: id => E.ent(id),
    order: id => { const u = E.ent(id); return { ...u.order, tgt: u.tgt }; },
    sel: () => W.ui.sel.slice().sort((a, b) => a - b),
    // Rettangolo (pagina) di un elemento, dopo averlo portato in vista dentro la barra che scorre.
    rect(sel) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, hit: !!top && (top === el || el.contains(top)) };
    },
    vib: () => window.__vib.slice(),
  };
}
// Vibrazione intercettata prima che la pagina si carichi: si registra ogni chiamata a navigator.vibrate.
function stubVibrate() {
  window.__vib = [];
  try { Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, writable: true, value: ms => { window.__vib.push(ms); return true; } }); } catch (e) { /* niente */ }
}

// Dita vere tramite CDP. Ogni tocco ha un id; touchEnd elenca le dita che restano giù.
function fingers(cdp) {
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id ?? 0, radiusX: 2, radiusY: 2, force: 1 })) });
  const F = {
    start: pts => send('touchStart', pts),
    move: pts => send('touchMove', pts),
    end: pts => send('touchEnd', pts || []),
    async tap(x, y) { await send('touchStart', [{ x, y }]); await sleep(40); await send('touchEnd', []); await sleep(60); },
    async doubleTap(x, y) { await F.tap(x, y); await sleep(90); await F.tap(x, y); },
    async long(x, y, ms = 650) { await send('touchStart', [{ x, y }]); await sleep(ms); await send('touchEnd', []); await sleep(60); },
    // Trascina un dito da a a b in n passi di dt ms; hold: ms fermo prima di alzarlo; long: tocco lungo prima di muoversi.
    async drag(a, b, { n = 12, dt = 16, hold = 0, long = 0, end = true } = {}) {
      await send('touchStart', [a]);
      if (long) await sleep(long);
      for (let i = 1; i <= n; i++) { await send('touchMove', [{ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }]); await sleep(dt); }
      if (hold) await sleep(hold);
      if (end) { await send('touchEnd', []); await sleep(40); }
    },
    // Due dita attorno a (cx, cy): distanza da d0 a d1 in n passi, poi si alzano una dopo l'altra.
    async pinch(cx, cy, d0, d1, n = 12) {
      const pts = d => [{ x: cx - d / 2, y: cy, id: 1 }, { x: cx + d / 2, y: cy, id: 2 }];
      await send('touchStart', [pts(d0)[0]]);
      await send('touchStart', pts(d0));
      for (let i = 1; i <= n; i++) { await send('touchMove', pts(d0 + (d1 - d0) * i / n)); await sleep(20); }
      await sleep(60);
      await send('touchEnd', [pts(d1)[0]]);
      await send('touchEnd', []);
      await sleep(80);
    },
  };
  return F;
}
const frames = (page, k = 2) => page.evaluate(k => new Promise(r => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), k);
const fmt = v => Math.round(v);

export async function runPhoneChecks({ browser, url, check, profiles }) {
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(stubVibrate);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);
    if (touch) await phoneChecks(page, name, check);
    else await desktopChecks(page, name, check);
    check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove dei gesti${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

async function phoneChecks(page, name, check) {
  const cdp = await page.context().newCDPSession(page);
  const F = fingers(cdp);
  const V = await page.evaluate(() => window.__t.view());
  const C = { x: V.x + V.w / 2, y: V.y + V.h / 2 };   // centro della mappa sullo schermo

  // 1. Un dito scorre la mappa (niente più pulsante «Mappa»); fermo prima di alzarlo, nessuna inerzia.
  {
    await page.evaluate(() => { const t = window.__t; t.reset(12345); t.clear(); });
    const noMode = await page.evaluate(() => !document.getElementById('btnMode'));
    const c0 = await page.evaluate(() => window.__t.cam());
    await F.drag({ x: C.x + 60, y: C.y + 40 }, { x: C.x - 60, y: C.y - 20 }, { n: 10, dt: 20, hold: 250 });
    const c1 = await page.evaluate(() => window.__t.cam());
    await page.waitForTimeout(300);
    const c2 = await page.evaluate(() => ({ ...window.__t.cam(), sel: window.__wz.ui.sel.length }));
    const dx = (c1.x - c0.x) * c1.z, dy = (c1.y - c0.y) * c1.z;
    check(noMode && Math.abs(dx - 120) < 3 && Math.abs(dy - 60) < 3 && Math.hypot(c2.x - c1.x, c2.y - c1.y) < 0.5 && c2.sel === 0,
      `${name}: un dito trascinato scorre la mappa di quanto si muove (${fmt(dx)}×${fmt(dy)} px per 120×60), fermo prima di alzarlo non scivola, niente selezione${noMode ? '' : '; il pulsante «Mappa» c’è ancora'}`);
  }

  // 2. Scorrimento veloce: la mappa continua a scivolare e rallenta; un tocco la ferma.
  {
    // L'inerzia usa i movimenti degli ultimi 100 ms: con la macchina carica (fotogrammi lenti, movimenti accorpati)
    // può non partire, quindi un secondo tentativo è ammesso e scritto nel messaggio.
    let v1 = 0, v2 = 0, tries = 0;
    while (tries < 2 && !(v1 > 100 && v2 > 0 && v2 < v1)) {
      tries++;
      await page.evaluate(() => { const t = window.__t; t.reset(12345); t.clear(); });
      await page.waitForTimeout(300);
      await F.drag({ x: C.x + 100, y: C.y }, { x: C.x - 60, y: C.y }, { n: 8, dt: 16 });
      const a = await page.evaluate(() => window.__t.cam());
      await page.waitForTimeout(150);
      const b = await page.evaluate(() => window.__t.cam());
      await page.waitForTimeout(150);
      const c = await page.evaluate(() => window.__t.cam());
      v1 = (b.x - a.x) / 0.15; v2 = (c.x - b.x) / 0.15;
    }
    check(v1 > 100 && v2 > 0 && v2 < v1,
      `${name}: dopo uno scorrimento veloce la mappa continua a scivolare e rallenta (${fmt(v1)} poi ${fmt(v2)} px/s nel mondo${tries > 1 ? ', al secondo tentativo' : ''})`);
    await F.tap(C.x, C.y + 30);
    const d = await page.evaluate(() => window.__t.cam());
    await page.waitForTimeout(200);
    const e = await page.evaluate(() => window.__t.cam());
    check(Math.abs(e.x - d.x) < 0.5 && Math.abs(e.y - d.y) < 0.5, `${name}: un tocco ferma la mappa che scivola (spostamento dopo il tocco ${(e.x - d.x).toFixed(1)} px)`);
  }

  // 2b. Il tocco che ferma la mappa non deve dare ordini ai mezzi selezionati.
  {
    const s = await page.evaluate(() => { const t = window.__t, c = t.reset(12345); t.clear(); const u = t.armed()[0]; t.put(u, c); window.__wz.ui.sel = [u.id]; return { id: u.id }; });
    await page.waitForTimeout(300);
    await F.drag({ x: C.x + 100, y: C.y + 20 }, { x: C.x - 60, y: C.y + 20 }, { n: 8, dt: 16 });
    await page.waitForTimeout(80);
    const moving = await page.evaluate(() => { const a = window.__t.cam(); return a; });
    await page.waitForTimeout(60);
    const moving2 = await page.evaluate(() => window.__t.cam());
    await F.tap(C.x, C.y + 40);
    const o = await page.evaluate(id => ({ o: window.__t.order(id), sel: window.__wz.ui.sel.length }), s.id);
    check(moving2.x > moving.x && o.o.t === 'idle' && o.sel === 1,
      `${name}: il tocco che ferma la mappa che scivola non dà ordini ai mezzi selezionati (ordine ${o.o.t}, selezionati ${o.sel})`);
  }

  // 3. Due dita: zoom attorno al punto tra le dita, con limiti 0,45–2,0.
  {
    await page.evaluate(() => { const t = window.__t; t.reset(12345); t.clear(); });
    const w0 = await page.evaluate(([x, y]) => { const W = window.__wz, r = document.getElementById('view').getBoundingClientRect(); return { x: W.cam.x + (x - r.left) / W.cam.z, y: W.cam.y + (y - r.top) / W.cam.z }; }, [C.x, C.y]);
    await F.pinch(C.x, C.y, 80, 140, 10);
    const r1 = await page.evaluate(([x, y]) => { const W = window.__wz, r = document.getElementById('view').getBoundingClientRect(); return { z: W.cam.z, x: W.cam.x + (x - r.left) / W.cam.z, y: W.cam.y + (y - r.top) / W.cam.z, sel: W.ui.sel.length }; }, [C.x, C.y]);
    check(Math.abs(r1.z - 1.75) < 0.08 && Math.hypot(r1.x - w0.x, r1.y - w0.y) < 6 && r1.sel === 0,
      `${name}: allargare due dita ingrandisce in proporzione (zoom ${r1.z.toFixed(2)}, atteso 1,75) e il punto tra le dita resta fermo (scarto ${fmt(Math.hypot(r1.x - w0.x, r1.y - w0.y))} px)`);
    await F.pinch(C.x, C.y, 60, Math.min(V.w, V.h) * 0.9, 12);
    const zMax = await page.evaluate(() => window.__wz.cam.z);
    await F.pinch(C.x, C.y, Math.min(V.w, V.h) * 0.9, 30, 12);
    await F.pinch(C.x, C.y, Math.min(V.w, V.h) * 0.9, 30, 12);
    const zMin = await page.evaluate(() => window.__wz.cam.z);
    check(Math.abs(zMax - 2.0) < 1e-6 && Math.abs(zMin - 0.45) < 1e-6, `${name}: lo zoom a due dita si ferma a 2,0 e a 0,45 (massimo ${zMax.toFixed(2)}, minimo ${zMin.toFixed(2)})`);
    // tolto un dito, l'altro continua a scorrere senza dare ordini né selezionare
    await page.evaluate(() => { const t = window.__t, c = t.reset(12345); t.clear(); const u = t.armed()[0]; t.put(u, c); window.__wz.ui.sel = [u.id]; });
    const z0 = await page.evaluate(() => window.__t.cam());
    await F.start([{ x: C.x - 40, y: C.y, id: 1 }]);
    await F.start([{ x: C.x - 40, y: C.y, id: 1 }, { x: C.x + 40, y: C.y, id: 2 }]);
    await F.move([{ x: C.x - 50, y: C.y, id: 1 }, { x: C.x + 50, y: C.y, id: 2 }]); await sleep(30);
    await F.end([{ x: C.x - 50, y: C.y, id: 1 }]); await sleep(30);
    for (let i = 1; i <= 6; i++) { await F.move([{ x: C.x - 50 + i * 10, y: C.y, id: 1 }]); await sleep(20); }
    await sleep(150);
    await F.end([]); await sleep(80);
    const z1 = await page.evaluate(() => ({ ...window.__t.cam(), o: window.__t.order(window.__wz.ui.sel[0] || 0), n: window.__wz.ui.sel.length }));
    check(z1.n === 1 && z1.o.t === 'idle' && z1.x < z0.x - 20 / z1.z,
      `${name}: dopo il pizzico il dito rimasto scorre la mappa senza ordini né selezione (camera ${fmt(z0.x)} → ${fmt(z1.x)}, ordine ${z1.o.t})`);
  }

  // 4. Tocco con aggancio: un tocco a ~28 px dal proprio mezzo lo seleziona; a ~50 px no.
  {
    const s = await page.evaluate(() => { const t = window.__t, c = t.reset(12345); t.clear(); const u = t.armed()[0]; t.put(u, c); return { id: u.id, x: u.x, y: u.y }; });
    const p = await page.evaluate(s => window.__t.scr(s.x + 28, s.y), s);
    await F.tap(p.x, p.y);
    const sel1 = await page.evaluate(() => window.__t.sel());
    await page.evaluate(() => { window.__wz.ui.sel = []; });
    const q = await page.evaluate(s => window.__t.scr(s.x - 50, s.y), s);
    await F.tap(q.x, q.y);
    const sel2 = await page.evaluate(() => window.__t.sel());
    check(p.onMap && sel1.length === 1 && sel1[0] === s.id && sel2.length === 0,
      `${name}: un tocco a 28 px dal proprio mezzo lo aggancia e lo seleziona (${JSON.stringify(sel1)}), a 50 px no (${JSON.stringify(sel2)})`);
  }

  // 5. Con un mezzo selezionato, un tocco poco lontano da lui (fuori dal mezzo, dentro il raggio d'aggancio) è un ordine.
  {
    const s = await page.evaluate(() => { const t = window.__t, c = t.reset(12345); t.clear(); const u = t.armed()[0]; t.put(u, c); window.__wz.ui.sel = [u.id]; return { id: u.id, x: u.x, y: u.y }; });
    const p = await page.evaluate(s => window.__t.scr(s.x + 28, s.y + 4), s);
    await F.tap(p.x, p.y);
    const o = await page.evaluate(id => ({ o: window.__t.order(id), sel: window.__t.sel() }), s.id);
    check(p.onMap && o.o.t === 'move' && o.sel.length === 1,
      `${name}: con un mezzo selezionato, un tocco a 28 px da lui resta un ordine di movimento (ordine ${o.o.t}, selezione ${JSON.stringify(o.sel)})`);
  }

  // 6. Doppio tocco su un mezzo: tutti i propri mezzi dello stesso tipo sullo schermo (non gli altri tipi, non quelli fuori).
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const same = [t.unit(0, 'CN', t.free(c.tx, c.ty)), t.unit(0, 'CN', t.free(c.tx + 2, c.ty + 1)), t.unit(0, 'CN', t.free(c.tx - 2, c.ty - 1))];
      const other = t.unit(0, 'MG', t.free(c.tx + 1, c.ty - 2));
      const far = t.unit(0, 'CN', t.free(c.tx + 30, c.ty));
      return { a: same[0].id, x: same[0].x, y: same[0].y, want: same.map(u => u.id).sort((a, b) => a - b), other: other.id, far: far.id };
    });
    const p = await page.evaluate(s => window.__t.scr(s.x, s.y), s);
    await F.doubleTap(p.x, p.y);
    const sel = await page.evaluate(() => window.__t.sel());
    check(JSON.stringify(sel) === JSON.stringify(s.want), `${name}: doppio tocco su un mezzo seleziona i ${s.want.length} mezzi uguali sullo schermo (selezione ${JSON.stringify(sel)}, attesa ${JSON.stringify(s.want)})`);
    // due tocchi lenti sono due tocchi: il secondo, sul mezzo già selezionato, lo lascia solo
    await page.evaluate(() => { window.__wz.ui.sel = []; });
    await F.tap(p.x, p.y); await sleep(450); await F.tap(p.x, p.y);
    const sel2 = await page.evaluate(() => window.__t.sel());
    check(sel2.length === 1 && sel2[0] === s.a, `${name}: due tocchi lenti (oltre 350 ms) non sono un doppio tocco (selezione ${JSON.stringify(sel2)})`);
  }

  // 7. Tocco lungo: vibrazione e anello; poi trascinare disegna il riquadro e seleziona i mezzi dentro.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const us = [t.unit(0, 'MG', t.free(c.tx - 1, c.ty - 1)), t.unit(0, 'CN', t.free(c.tx + 1, c.ty)), t.unit(0, 'MG', t.free(c.tx, c.ty + 1))];
      const out = t.unit(0, 'MG', t.free(c.tx + 6, c.ty + 5));
      return { want: us.map(u => u.id).sort((a, b) => a - b), out: out.id, x0: c.x - 3 * 32, y0: c.y - 3 * 32, x1: c.x + 3 * 32, y1: c.y + 3 * 32 };
    });
    const a = await page.evaluate(s => window.__t.scr(s.x0, s.y0), s), b = await page.evaluate(s => window.__t.scr(s.x1, s.y1), s);
    const c0 = await page.evaluate(() => window.__t.cam());
    await F.start([{ x: a.x, y: a.y }]);
    await sleep(620);
    const mid = await page.evaluate(() => ({ vib: window.__t.vib(), box: window.__wz.fxs.boxSel ? { long: !!window.__wz.fxs.boxSel.long } : null }));
    for (let i = 1; i <= 10; i++) { await F.move([{ x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 }]); await sleep(16); }
    const during = await page.evaluate(() => !!window.__wz.fxs.boxSel);
    await F.end([]); await sleep(60);
    const r = await page.evaluate(() => ({ sel: window.__t.sel(), cam: window.__t.cam(), box: window.__wz.fxs.boxSel }));
    check(mid.vib.length >= 1 && mid.box && mid.box.long, `${name}: il tocco lungo vibra (navigator.vibrate ${JSON.stringify(mid.vib)}) e mostra l’anello sotto il dito`);
    check(a.onMap && b.onMap && during && JSON.stringify(r.sel) === JSON.stringify(s.want) && !r.box && Math.hypot(r.cam.x - c0.x, r.cam.y - c0.y) < 0.5,
      `${name}: tocco lungo e trascinare disegna un riquadro e seleziona i ${s.want.length} mezzi dentro, la mappa resta ferma (selezione ${JSON.stringify(r.sel)}, attesa ${JSON.stringify(s.want)})`);
  }

  // 8. Riquadro vicino al bordo: la mappa scorre da sola; l'angolo di partenza resta fermo sul mondo.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const near = t.unit(0, 'MG', t.free(c.tx, c.ty));
      return { id: near.id, x: c.x - 64, y: c.y - 64 };
    });
    const a = await page.evaluate(s => window.__t.scr(s.x, s.y), s);
    const c0 = await page.evaluate(() => window.__t.cam());
    const edge = { x: V.x + V.w - 12, y: a.y + 120 };
    await F.drag({ x: a.x, y: a.y }, edge, { n: 10, dt: 16, long: 620, hold: 700, end: false });
    const c1 = await page.evaluate(() => window.__t.cam());
    // un mezzo appena entrato nel riquadro grazie allo scorrimento
    const s2 = await page.evaluate(([s, ex, ey]) => {
      const t = window.__t, W = window.__wz, r = document.getElementById('view').getBoundingClientRect();
      const wx = W.cam.x + (ex - r.left) / W.cam.z - 40, wy = W.cam.y + (ey - r.top) / W.cam.z - 20;
      const u = t.unit(0, 'CN', t.free(Math.floor(wx / 32), Math.floor(wy / 32)));
      return { id: u.id, x: u.x, y: u.y, inside: u.x > s.x && u.y > s.y };
    }, [s, edge.x, edge.y]);
    await F.end([]); await sleep(60);
    const sel = await page.evaluate(() => window.__t.sel());
    const moved = (c1.x - c0.x) * c1.z;
    check(moved > 60 && sel.includes(s.id) && (!s2.inside || sel.includes(s2.id)),
      `${name}: con il riquadro vicino al bordo destro la mappa scorre da sola (${fmt(moved)} px in 0,7 s) e il riquadro tiene l’angolo di partenza (selezione ${JSON.stringify(sel)})`);
  }

  // 9. Tocco lungo senza trascinare: su un proprio mezzo = mezzi uguali sullo schermo; sul terreno con armati selezionati
  //    = attacca-muovi; sul terreno senza selezione = niente di strano.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const same = [t.unit(0, 'RK', t.free(c.tx, c.ty)), t.unit(0, 'RK', t.free(c.tx + 3, c.ty + 2))];
      t.unit(0, 'MG', t.free(c.tx - 2, c.ty + 2));
      return { x: same[0].x, y: same[0].y, want: same.map(u => u.id).sort((a, b) => a - b), gx: c.x - 4 * 32, gy: c.y - 3 * 32 };
    });
    const p = await page.evaluate(s => window.__t.scr(s.x, s.y), s);
    await F.long(p.x, p.y);
    const sel = await page.evaluate(() => window.__t.sel());
    check(JSON.stringify(sel) === JSON.stringify(s.want), `${name}: tocco lungo su un proprio mezzo seleziona quelli uguali sullo schermo (selezione ${JSON.stringify(sel)}, attesa ${JSON.stringify(s.want)})`);
    const g = await page.evaluate(s => window.__t.scr(s.gx, s.gy), s);
    await F.long(g.x, g.y);
    const o = await page.evaluate(ids => ids.map(id => window.__t.order(id).t), s.want);
    const am = await page.evaluate(() => window.__wz.ui.amove);
    check(g.onMap && o.every(t => t === 'amove') && !am, `${name}: tocco lungo sul terreno con mezzi armati selezionati dà attacca-muovi (ordini ${JSON.stringify(o)})`);
    await page.evaluate(() => { window.__wz.ui.sel = []; });
    await F.long(g.x, g.y);
    const r = await page.evaluate(() => ({ sel: window.__wz.ui.sel.length, amove: window.__wz.ui.amove }));
    check(r.sel === 0 && !r.amove, `${name}: tocco lungo sul terreno senza selezione non seleziona nulla e non arma l’attacca-muovi`);
  }

  // 10. Squadre 1–4 sulla barra: tocco lungo salva, tocco seleziona, doppio tocco seleziona e centra; contatore «N sel.».
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const us = [t.unit(0, 'MG', t.free(c.tx, c.ty)), t.unit(0, 'CN', t.free(c.tx + 1, c.ty + 1))];
      window.__wz.ui.sel = us.map(u => u.id);
      return { ids: us.map(u => u.id).sort((a, b) => a - b), x: us[0].x, y: us[0].y };
    });
    await frames(page);
    const cnt2 = await page.evaluate(() => { const el = document.getElementById('selCount'); return { n: el.querySelector('b').textContent, zero: el.classList.contains('zero'), r: window.__t.rect(el) }; });
    const b2 = await page.evaluate(() => window.__t.rect('[data-squad="2"]'));
    await F.long(b2.x, b2.y, 650);
    await page.waitForTimeout(250);
    const saved = await page.evaluate(() => ({ g: (window.__wz.ui.groups['2'] || []).slice().sort((a, b) => a - b), txt: document.querySelector('[data-squad="2"] small').textContent, vib: window.__t.vib(), sel: window.__wz.ui.sel.length }));
    check(b2.hit && JSON.stringify(saved.g) === JSON.stringify(s.ids) && saved.txt === '2' && saved.vib.length >= 1 && saved.sel === 2,
      `${name}: tocco lungo sulla squadra 2 salva la selezione (squadra ${JSON.stringify(saved.g)}, pulsante «${saved.txt}», vibrazione ${JSON.stringify(saved.vib)})`);
    check(cnt2.n === '2' && !cnt2.zero && cnt2.r && cnt2.r.w > 0, `${name}: il contatore sulla barra mostra «2 sel.» (mostra «${cnt2.n}»)`);
    await page.evaluate(() => { window.__wz.ui.sel = []; });
    await frames(page);
    const cnt0 = await page.evaluate(() => { const el = document.getElementById('selCount'); return { n: el.querySelector('b').textContent, zero: el.classList.contains('zero') }; });
    const b2b = await page.evaluate(() => window.__t.rect('[data-squad="2"]'));
    await F.tap(b2b.x, b2b.y);
    await frames(page);
    const r1 = await page.evaluate(() => ({ sel: window.__t.sel(), n: document.querySelector('#selCount b').textContent }));
    check(cnt0.n === '0' && cnt0.zero && JSON.stringify(r1.sel) === JSON.stringify(s.ids) && r1.n === '2',
      `${name}: un tocco sulla squadra 2 la seleziona e il contatore passa da «${cnt0.n}» a «${r1.n}» (selezione ${JSON.stringify(r1.sel)})`);
    // lontano dalla squadra, poi doppio tocco: selezionata e visuale su di lei
    await page.evaluate(() => { const t = window.__t, W = window.__wz; W.ui.sel = []; t.center(16 * 32, 50 * 32); });
    await page.waitForTimeout(400);
    const b2c = await page.evaluate(() => window.__t.rect('[data-squad="2"]'));
    await F.tap(b2c.x, b2c.y); await sleep(80); await F.tap(b2c.x, b2c.y);
    const r2 = await page.evaluate(s => { const t = window.__t, m = t.mid(); return { sel: t.sel(), d: Math.hypot(m.x - s.x, m.y - s.y) }; }, s);
    check(JSON.stringify(r2.sel) === JSON.stringify(s.ids) && r2.d < 64, `${name}: doppio tocco sulla squadra 2 la seleziona e porta lì la visuale (centro a ${fmt(r2.d)} px dalla squadra)`);
    // squadra vuota: un tocco avvisa e non cambia la selezione
    await page.waitForTimeout(400);
    const b4 = await page.evaluate(() => window.__t.rect('[data-squad="4"]'));
    await F.tap(b4.x, b4.y);
    const r3 = await page.evaluate(() => ({ sel: window.__wz.ui.sel.length, toast: [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent).pop() || '' }));
    check(r3.sel === 2 && /Squadra 4 vuota/.test(r3.toast), `${name}: un tocco su una squadra vuota non cambia la selezione e lo dice («${r3.toast}»)`);
  }

  // 11. Avviso toccabile: «Contatto nemico» fuori visuale; toccandolo («Vai ›») la visuale va lì.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345); t.clear();
      const u = t.armed()[0]; t.put(u, t.free(c.tx + 20, c.ty + 14));
      E.S.lastWarn = -100; E.damage(u, 1, 1);
      const el = [...document.querySelectorAll('#toasts .toast')].pop();
      return { x: u.x, y: u.y, txt: el ? el.textContent : '', go: !!el && el.classList.contains('go') };
    });
    const r = await page.evaluate(() => window.__t.rect([...document.querySelectorAll('#toasts .toast')].pop()));
    const vai = await page.evaluate(() => { const el = [...document.querySelectorAll('#toasts .toast')].pop(); return el ? getComputedStyle(el, '::after').content + ' ' + getComputedStyle(el, '::before').content : ''; });
    await F.tap(r.x, r.y);
    const d = await page.evaluate(s => { const m = window.__t.mid(); return { d: Math.hypot(m.x - s.x, m.y - s.y), left: document.querySelectorAll('#toasts .toast.go').length }; }, s);
    check(/Contatto nemico/.test(s.txt) && s.go && r.hit && d.d < 48, `${name}: l’avviso «${s.txt}» è toccabile e porta la visuale sul mezzo colpito (centro a ${fmt(d.d)} px)`);
    check(/Vai/.test(vai), `${name}: l’avviso toccabile mostra «Vai ›» (${vai.trim()})`);
  }

  // 12. Frecce ai bordi: uno scontro fuori visuale fa comparire una freccia; toccarla porta lì; al massimo 3 frecce;
  //     senza nuovi spari spariscono dopo 5 s.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345); t.clear();
      const spots = [[c.tx + 22, c.ty], [c.tx - 22, c.ty - 4], [c.tx + 4, c.ty + 22], [c.tx - 4, c.ty - 24]].filter(([x, y]) => x > 1 && y > 1 && x < 62 && y < 62);
      const fights = spots.map(([x, y]) => {
        const a = t.unit(0, 'MG', t.free(x, y), 'M'), b = t.unit(1, 'MG', t.free(x + 2, y), 'M');
        a.hp = b.hp = 1e6; a.max = b.max = 1e6;
        return { x: a.x, y: a.y, a: a.id, b: b.id };
      });
      E.updateFog();
      // primo scontro da solo: una freccia
      for (let i = 0; i < 40; i++) W.step(0.05);
      return { fights };
    });
    await frames(page, 3);
    const n1 = await page.evaluate(() => document.querySelectorAll('#arrows .edgearrow').length);
    await page.waitForTimeout(100);
    // la prima freccia non coperta (l'avviso «Contatto nemico» in alto può coprirne una)
    const rs = await page.evaluate(() => [...document.querySelectorAll('#arrows .edgearrow')].map(el => window.__t.rect(el)));
    const r = rs.find(x => x && x.hit);
    const inStage = await page.evaluate(rs => { const v = window.__t.view(); return rs.every(r => r.x >= v.x && r.x <= v.x + v.w && r.y >= v.y && r.y <= v.y + v.h); }, rs);
    check(n1 >= 1 && n1 <= 3 && r && inStage, `${name}: 4 scontri fuori visuale fanno comparire le frecce ai bordi della mappa (${n1}, al massimo 3) e si possono toccare`);
    if (r) await F.tap(r.x, r.y);
    const d = await page.evaluate(s => { const m = window.__t.mid(); return Math.min(...s.fights.map(f => Math.hypot(m.x - f.x, m.y - f.y))); }, s);
    check(!!r && d < 160, `${name}: toccare la freccia porta la visuale sullo scontro (centro a ${fmt(d)} px dal più vicino)`);
    // via i nemici: senza nuovi spari le frecce spariscono dopo 5 s di gioco
    await page.evaluate(s => {
      const W = window.__wz, E = W.engine;
      // tolti in silenzio (una distruzione sarebbe un altro scontro)
      for (const f of s.fights) for (const id of [f.a, f.b]) { const e = E.ent(id); if (e) e.dead = true; }
      for (let i = 0; i < 20 * 6; i++) W.step(0.05);
    }, s);
    await frames(page, 3);
    const n2 = await page.evaluate(() => document.querySelectorAll('#arrows .edgearrow').length);
    check(n2 === 0, `${name}: senza nuovi scontri le frecce spariscono dopo 5 s (${n2} rimaste)`);
  }

  // 13. «Allarme»: porta all'ultimo scontro, toccato di nuovo ai precedenti, poi da capo; il numero sul pulsante.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345); t.clear();
      const spots = [[c.tx + 18, c.ty + 2], [c.tx - 18, c.ty - 2]];
      const out = [];
      for (const [x, y] of spots) {
        const a = t.unit(0, 'MG', t.free(x, y), 'M'), b = t.unit(1, 'MG', t.free(x + 2, y), 'M');
        a.hp = b.hp = 1e6; a.max = b.max = 1e6;
        E.updateFog();
        for (let i = 0; i < 30; i++) W.step(0.05);
        E.kill(b, 0);
        out.push({ x: a.x, y: a.y });
      }
      return { out: out.reverse() };   // dal più recente
    });
    await page.waitForTimeout(350);
    const badge = await page.evaluate(() => document.querySelector('#btnAlarm .bdg').textContent);
    const at = [];
    for (let i = 0; i < 3; i++) {
      const r = await page.evaluate(() => window.__t.rect('#btnAlarm'));
      await F.tap(r.x, r.y);
      at.push(await page.evaluate(s => { const m = window.__t.mid(); return s.out.map(f => Math.hypot(m.x - f.x, m.y - f.y)); }, s));
    }
    const near = d => d < 200;
    check(badge === '2' && near(at[0][0]) && near(at[1][1]) && near(at[2][0]),
      `${name}: «Allarme» (numero «${badge}») porta all’ultimo scontro, poi al precedente, poi di nuovo all’ultimo (distanze ${at.map((d, i) => fmt(d[[0, 1, 0][i]])).join(', ')} px)`);
  }

  // 14. Minimappa: tocco = visuale lì senza ordini; tocco lungo con mezzi selezionati = mandali lì.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const us = [t.unit(0, 'MG', t.free(c.tx, c.ty)), t.unit(0, 'MG', t.free(c.tx + 1, c.ty))];
      window.__wz.ui.sel = us.map(u => u.id);
      return { ids: us.map(u => u.id) };
    });
    await page.waitForTimeout(400);   // il pannello (sopra la minimappa) si ridisegna con la selezione
    const m = await page.evaluate(() => window.__t.rect('#mini'));
    const mx = m.x - m.w / 2 + m.w * 0.15, my = m.y - m.h / 2 + m.h * 0.2;   // in alto a sinistra: (0,15; 0,2) della mappa
    await F.tap(mx, my);
    const r1 = await page.evaluate(s => { const t = window.__t, W = window.__wz, M = 64 * 32, c = t.mid(); return { cx: c.x / M, cy: c.y / M, o: s.ids.map(id => t.order(id).t) }; }, s);
    check(m.hit && Math.abs(r1.cx - 0.15) < 0.03 && Math.abs(r1.cy - 0.2) < 0.03 && r1.o.every(t => t === 'idle'),
      `${name}: un tocco sulla minimappa porta lì la visuale (${r1.cx.toFixed(2)}, ${r1.cy.toFixed(2)}) senza dare ordini (${JSON.stringify(r1.o)})`);
    const lx = m.x - m.w / 2 + m.w * 0.7, ly = m.y - m.h / 2 + m.h * 0.35;
    await F.long(lx, ly, 650);
    const r2 = await page.evaluate(s => { const t = window.__t, M = 64 * 32; return s.ids.map(id => { const o = t.order(id); return { t: o.t, x: o.x / M, y: o.y / M }; }); }, s);
    const ok = r2.every(o => o.t === 'move' && Math.hypot(o.x - 0.7, o.y - 0.35) < 0.08);
    const vib = await page.evaluate(() => window.__t.vib().length);
    check(ok && vib >= 1, `${name}: tocco lungo sulla minimappa con mezzi selezionati li manda lì (${r2.map(o => `${o.t} ${o.x.toFixed(2)},${o.y.toFixed(2)}`).join(' · ')}; atteso 0,70,0,35 ±0,08)`);
    await page.evaluate(s => { window.__wz.ui.sel = []; for (const id of s.ids) window.__t.ent(id).order = { t: 'idle' }; }, s);
    await page.waitForTimeout(400);
    const m2 = await page.evaluate(() => window.__t.rect('#mini'));
    await F.long(m2.x - m2.w / 2 + m2.w * 0.7, m2.y - m2.h / 2 + m2.h * 0.35, 650);
    const r3 = await page.evaluate(s => s.ids.map(id => window.__t.order(id).t), s);
    check(r3.every(t => t === 'idle'), `${name}: tocco lungo sulla minimappa senza selezione non dà ordini (${JSON.stringify(r3)})`);
  }
  await cdp.detach();
}

async function desktopChecks(page, name, check) {
  const V = await page.evaluate(() => window.__t.view());
  const C = { x: V.x + V.w / 2, y: V.y + V.h / 2 };
  // 1. Clic su un proprio mezzo lo seleziona; un clic a 28 px no (l'aggancio è solo per il tocco).
  {
    const s = await page.evaluate(() => { const t = window.__t, c = t.reset(12345); t.clear(); const u = t.armed()[0]; t.put(u, c); return { id: u.id, x: u.x, y: u.y }; });
    const p = await page.evaluate(s => window.__t.scr(s.x, s.y), s);
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
    const sel1 = await page.evaluate(() => window.__t.sel());
    await page.evaluate(() => { window.__wz.ui.sel = []; });
    const q = await page.evaluate(s => window.__t.scr(s.x + 28, s.y), s);
    await page.mouse.click(q.x, q.y); await page.waitForTimeout(60);
    const sel2 = await page.evaluate(() => window.__t.sel());
    check(sel1.length === 1 && sel1[0] === s.id && sel2.length === 0, `${name}: il clic su un mezzo lo seleziona, un clic a 28 px no (niente aggancio col mouse) (${JSON.stringify(sel1)} / ${JSON.stringify(sel2)})`);
  }
  // 2. Trascinare col mouse disegna il riquadro e non sposta la mappa.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const us = [t.unit(0, 'MG', t.free(c.tx - 1, c.ty - 1)), t.unit(0, 'CN', t.free(c.tx + 1, c.ty))];
      return { want: us.map(u => u.id).sort((a, b) => a - b), x0: c.x - 3 * 32, y0: c.y - 3 * 32, x1: c.x + 3 * 32, y1: c.y + 3 * 32 };
    });
    const a = await page.evaluate(s => window.__t.scr(s.x0, s.y0), s), b = await page.evaluate(s => window.__t.scr(s.x1, s.y1), s);
    const c0 = await page.evaluate(() => window.__t.cam());
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(60);
    const r = await page.evaluate(() => ({ sel: window.__t.sel(), cam: window.__t.cam() }));
    check(JSON.stringify(r.sel) === JSON.stringify(s.want) && Math.hypot(r.cam.x - c0.x, r.cam.y - c0.y) < 0.5,
      `${name}: trascinare col mouse seleziona con il riquadro e la mappa resta ferma (selezione ${JSON.stringify(r.sel)})`);
  }
  // 3. Rotella: zoom con i limiti del computer (0,55–1,7).
  {
    await page.evaluate(() => { const t = window.__t; t.reset(12345); });
    await page.mouse.move(C.x, C.y);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -100); await page.waitForTimeout(15); }
    const zMax = await page.evaluate(() => window.__wz.cam.z);
    for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(15); }
    const zMin = await page.evaluate(() => window.__wz.cam.z);
    check(Math.abs(zMax - 1.7) < 1e-6 && Math.abs(zMin - 0.55) < 1e-6, `${name}: la rotella fa lo zoom tra 0,55 e 1,7 (massimo ${zMax.toFixed(2)}, minimo ${zMin.toFixed(2)})`);
  }
  // 4. Ctrl+1 salva la squadra, 1 la richiama; la squadra è la stessa dei pulsanti 1–4 della barra.
  {
    const s = await page.evaluate(() => {
      const t = window.__t, c = t.reset(12345); t.clear();
      const us = [t.unit(0, 'MG', t.free(c.tx, c.ty)), t.unit(0, 'CN', t.free(c.tx + 1, c.ty + 1)), t.unit(0, 'CN', t.free(c.tx - 1, c.ty + 1))];
      window.__wz.ui.sel = us.map(u => u.id);
      return { ids: us.map(u => u.id).sort((a, b) => a - b) };
    });
    await page.keyboard.press('Control+1');
    await page.keyboard.press('Escape');
    const n0 = await page.evaluate(() => window.__wz.ui.sel.length);
    await page.keyboard.press('1');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ sel: window.__t.sel(), btn: document.querySelector('[data-squad="1"] small').textContent, cnt: document.querySelector('#selCount b').textContent }));
    check(n0 === 0 && JSON.stringify(r.sel) === JSON.stringify(s.ids), `${name}: Ctrl+1 salva la squadra e 1 la richiama (selezione ${JSON.stringify(r.sel)})`);
    check(r.btn === '3' && r.cnt === '3', `${name}: la squadra da tastiera compare sul pulsante 1 della barra («${r.btn}») e il contatore mostra «${r.cnt} sel.»`);
    // il pulsante della barra, con un clic, richiama la stessa squadra
    await page.keyboard.press('Escape');
    await page.locator('[data-squad="1"]').click();
    const sel = await page.evaluate(() => window.__t.sel());
    check(JSON.stringify(sel) === JSON.stringify(s.ids), `${name}: un clic sul pulsante 1 della barra richiama la squadra salvata con Ctrl+1 (selezione ${JSON.stringify(sel)})`);
  }
}

// Lancio da solo: node tests/e2e/telefono.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runPhoneChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli dei gesti sono passati.');
}
