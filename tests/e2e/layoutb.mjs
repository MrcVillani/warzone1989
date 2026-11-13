// Prove della disposizione B per telefono e schermi bassi (piano 05) con tocchi veri via CDP
// (Input.dispatchTouchEvent): barra delle schede, cassetti, Produci con tessere e coda, selezione con il cassetto
// aperto, piazzamento con conferma, Ricerca e Progetta dal cassetto, minimappa ingrandita, bersagli tattili,
// nessuna sovrapposizione. Sul computer (1280×800) la plancia classica deve restare identica a prima.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/layoutb.mjs
// Esporta anche gli strumenti usati dalle altre prove: openMenu (apre il cassetto «Menu» dove stanno Suono, Comandi,
// Esci…) e lbLayout (riquadri della disposizione B e sovrapposizioni, da eseguire nella pagina).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const phone = (w, h) => ({ ...devices['Pixel 7'], viewport: { width: w, height: h }, screen: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
// Telefono in orizzontale (come l'app Android), schermo basso e stretto, telefono in verticale.
export const LB_PROFILES = [
  ['telefono-orizzontale', phone(851, 393)],
  ['telefono-basso', phone(740, 360)],
  ['telefono', devices['Pixel 7']],
];
// Plancia del computer a 1280×800 prima della disposizione B (misurata sul commit 5f5143d, che non la conteneva):
// [sinistra, alto, larghezza, altezza] in px. Il computer non deve cambiare.
const DESK_REF = {
  '#bar': [16, 8, 1248, 43], '#body': [16, 59, 1248, 733], '#stage': [16, 59, 926, 733], '#view': [17, 60, 924, 731],
  '#panel': [952, 59, 312, 733], '.mm': [953, 60, 310, 330], '#mini': [963, 89, 292, 292], '#sel': [953, 390, 310, 107],
  '#tabs': [953, 497, 310, 34], '#tabs [data-tab="build"]': [953, 497, 77.5, 33], '#tabs [data-tab="des"]': [1185.5, 497, 77.5, 33],
  '#touchbar': [23, 749, 595.6, 36], '.barbtns': [968.6, 14, 295.4, 31],
};
const TITLES = { build: 'Costruisci', prod: 'Produci', res: 'Ricerca', des: 'Progetta', menu: 'Menu' };

// Su telefono Suono, Velocità, Pausa, Comandi ed Esci stanno nel cassetto «Menu»: lo apre se serve (sul computer
// e con il cassetto già aperto su «Menu» non fa nulla). Restituisce true se l'ha aperto.
export async function openMenu(page) {
  const need = await page.evaluate(() => document.documentElement.classList.contains('lb') && !!window.__wz.S && window.__wz.ui.drawer !== 'menu');
  if (!need) return false;
  await page.locator('#tabs [data-tab="menu"]').click();
  await page.waitForFunction(() => window.__wz.ui.drawer === 'menu' && getComputedStyle(document.getElementById('drawer')).visibility === 'visible');
  await page.waitForTimeout(350); // fine dello scorrimento del cassetto
  return true;
}

// Nella pagina: riquadri visibili della disposizione B e coppie che si sovrappongono. Gli elementi dentro la fila
// degli ordini si ritagliano sulla fila (quelli fuori sono nascosti dallo scorrimento della fila).
export function lbLayout() {
  const shown = el => {
    if (!el || el.hidden) return false;
    for (let e = el; e; e = e.parentElement) if (getComputedStyle(e).display === 'none') return false;
    return getComputedStyle(el).visibility !== 'hidden';
  };
  const R = (el, name) => { if (!shown(el)) return null; const b = el.getBoundingClientRect(); return b.width < 1 || b.height < 1 ? null : { name, x: b.left, y: b.top, r: b.right, b: b.bottom }; };
  const box = (sel, name) => R(document.querySelector(sel), name);
  const union = (name, ...bs) => { bs = bs.filter(Boolean); return bs.length ? { name, x: Math.min(...bs.map(b => b.x)), y: Math.min(...bs.map(b => b.y)), r: Math.max(...bs.map(b => b.r)), b: Math.max(...bs.map(b => b.b)) } : null; };
  const clip = (a, c) => { if (!a || !c) return a; const o = { name: a.name, x: Math.max(a.x, c.x), y: Math.max(a.y, c.y), r: Math.min(a.r, c.r), b: Math.min(a.b, c.b) }; return o.r - o.x < 1 || o.b - o.y < 1 ? null : o; };
  const hit = (a, b) => Math.min(a.r, b.r) - Math.max(a.x, b.x) > 0.5 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 0.5;
  const tb = box('#touchbar', 'ordini');
  const sel = clip(box('#selCount', 'selezione'), tb);
  const orders = [...document.querySelectorAll('#touchbar > button')].map(b => clip(R(b, b.id || `squadra ${b.dataset.squad}`), tb)).filter(Boolean);
  const parts = [
    box('#bar .readouts', 'striscia'), box('#objective', 'obiettivo'), sel, union('ordini e squadre', ...orders),
    union('minimappa', box('.mm', ''), box('#btnMiniBig', '')), box('#tabs', 'barra'), box('#drawer', 'cassetto'),
    box('#placebar .pbinfo', 'piazzamento'), box('#btnPlaceOk', '✓'), box('#btnPlaceNo', '✕'),
  ].filter(Boolean);
  const overlaps = [];
  // il riquadro della selezione sta nella fila degli ordini: tra loro si controlla pulsante per pulsante, qui sotto
  const same = (a, b) => [a.name, b.name].sort().join() === 'ordini e squadre,selezione';
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) if (!same(parts[i], parts[j]) && hit(parts[i], parts[j])) overlaps.push(`${parts[i].name}/${parts[j].name}`);
  // dentro la fila: riquadro della selezione e pulsanti non si coprono tra loro
  const row = [sel, ...orders].filter(Boolean);
  for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) if (hit(row[i], row[j])) overlaps.push(`${row[i].name}/${row[j].name}`);
  const vw = innerWidth, vh = innerHeight;
  const outside = parts.filter(p => p.x < -0.5 || p.y < -0.5 || p.r > vw + 0.5 || p.b > vh + 0.5).map(p => p.name);
  const dr = document.getElementById('drawer'), cv = document.getElementById('view'), st = cv.getBoundingClientRect();
  return {
    vw, vh, lb: document.documentElement.classList.contains('lb'), lbv: document.documentElement.classList.contains('lbv'),
    open: document.documentElement.classList.contains('dopen'), drawerHidden: getComputedStyle(dr).visibility === 'hidden',
    mapFree: document.elementFromPoint(st.left + st.width / 2, st.top + st.height / 2) === cv,
    parts: Object.fromEntries(parts.map(p => [p.name, [p.x, p.y, p.r - p.x, p.b - p.y].map(Math.round)])), overlaps, outside,
    hscroll: document.documentElement.scrollWidth > vw + 0.5,
  };
}

// Strumenti dentro la pagina: preparano le situazioni e convertono le coordinate.
function installHelpers() {
  const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
  const vw = () => cv.clientWidth / W.cam.z, vh = () => cv.clientHeight / W.cam.z;
  const free = (tx, ty) => { const f = E.nearestFree(tx, ty, false); return { tx: f[0], ty: f[1], x: (f[0] + 0.5) * T, y: (f[1] + 0.5) * T }; };
  window.__lb = {
    // Nuova partita in pausa, niente selezione, cassetto chiuso, zoom 1, base esplorata, visuale accanto al comando.
    reset(seed = 12345) {
      E.newGame('normale', seed);
      Object.assign(W.ui, { sel: [], groups: {}, placing: null, ghost: null, amove: false, paused: true, drawer: null, producer: 0, tab: 'build', resFold: {}, draft: { c: 'L', p: 'W', w: 'MG' }, key: '' });
      W.cam.z = 1; W.fxs.shake = 0; W.fxs.boxSel = null;
      for (const el of document.querySelectorAll('#toasts > *, #arrows > *')) el.remove();
      const hq = E.S.ents.find(e => e.type === 'hq' && e.owner === 0);
      const hx = Math.floor(hq.x / T), hy = Math.floor(hq.y / T);
      for (let y = hy - 14; y <= hy + 14; y++) for (let x = hx - 14; x <= hx + 14; x++) if (x >= 0 && y >= 0 && x < E.MW && y < E.MH) E.explored[x + y * E.MW] = 1;
      E.updateFog();
      this.center(hq.x + 2 * T, hq.y);
      return { hq: hq.id, hx: hq.x, hy: hq.y };
    },
    free,
    center(x, y) { W.cam.x = x - vw() / 2; W.cam.y = y - vh() / 2; },
    // Punto della pagina di un punto del mondo e se lì sopra c'è la mappa.
    scr(wx, wy) {
      const r = cv.getBoundingClientRect(), x = r.left + (wx - W.cam.x) * W.cam.z, y = r.top + (wy - W.cam.y) * W.cam.z;
      const el = document.elementFromPoint(x, y);
      return { x, y, onMap: el === cv, under: el ? (el.id || el.className || el.tagName) : null };
    },
    // Mondo sotto un punto della pagina.
    world(px, py) { const r = cv.getBoundingClientRect(); return { x: W.cam.x + (px - r.left) / W.cam.z, y: W.cam.y + (py - r.top) / W.cam.z }; },
    // Posti dove l'edificio si può piazzare e che si vedono per intero sulla mappa (nessun pannello sopra,
    // lontano dai bordi che fanno scorrere la mappa); avoid: [{x, y, d}] punti del mondo da cui stare lontani.
    spots(type, avoid = []) {
      const D = E.STRUCTS[type], r = cv.getBoundingClientRect(), z = W.cam.z, out = [];
      for (let ty = Math.floor(W.cam.y / T); ty <= Math.ceil((W.cam.y + vh()) / T); ty++) for (let tx = Math.floor(W.cam.x / T); tx <= Math.ceil((W.cam.x + vw()) / T); tx++) {
        if (!E.canPlace(0, type, tx, ty)) continue;
        const cx = (tx + D.w / 2) * T, cy = (ty + D.h / 2) * T;
        if (!avoid.every(a => Math.hypot(a.x - cx, a.y - cy) >= a.d)) continue;
        const pts = [[cx, cy], [tx * T + 3, ty * T + 3], [(tx + D.w) * T - 3, ty * T + 3], [tx * T + 3, (ty + D.h) * T - 3], [(tx + D.w) * T - 3, (ty + D.h) * T - 3]];
        let ok = true;
        for (const [x, y] of pts) {
          const sx = r.left + (x - W.cam.x) * z, sy = r.top + (y - W.cam.y) * z;
          if (sx < r.left + 50 || sx > r.right - 50 || sy < r.top + 50 || sy > r.bottom - 50 || document.elementFromPoint(sx, sy) !== cv) { ok = false; break; }
        }
        if (ok) out.push({ tx, ty, x: cx, y: cy, sx: r.left + (cx - W.cam.x) * z, sy: r.top + (cy - W.cam.y) * z });
      }
      return out;
    },
    // Casella in alto a sinistra dell'edificio con il centro in (wx, wy): come la calcolano il gioco e il motore.
    tileOf(type, wx, wy) { const D = E.STRUCTS[type]; return [Math.floor(wx / T - D.w / 2 + 0.5), Math.floor(wy / T - D.h / 2 + 0.5)]; },
    // Rettangolo (pagina) di un elemento, dopo averlo portato in vista, e se il punto centrale lo colpisce.
    rect(sel) {
      const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) return null;
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, t: b.top, w: b.width, h: b.height, hit: !!top && (top === el || el.contains(top)) };
    },
    st() {
      const dr = document.getElementById('drawer'), b = dr.getBoundingClientRect();
      return {
        drawer: W.ui.drawer, open: document.documentElement.classList.contains('dopen'), vis: getComputedStyle(dr).visibility,
        title: document.getElementById('drawTitle').textContent, box: { x: b.left, y: b.top, w: b.width, h: b.height },
        on: [...document.querySelectorAll('#tabs [data-tab].on')].map(e => e.dataset.tab), exp: [...document.querySelectorAll('#tabs [data-tab][aria-expanded="true"]')].map(e => e.dataset.tab),
        placing: W.ui.placing, res: E.S.res[0], sel: W.ui.sel.slice().sort((a, b) => a - b), producer: W.ui.producer,
      };
    },
    toasts: () => [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent).join(' | '),
    hscroll: () => document.documentElement.scrollWidth > innerWidth + 0.5,
  };
}

// Dita vere tramite CDP (come in telefono.mjs).
function fingers(cdp) {
  const send = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id ?? 0, radiusX: 2, radiusY: 2, force: 1 })) });
  return {
    async tap(x, y) { await send('touchStart', [{ x, y }]); await sleep(40); await send('touchEnd', []); await sleep(80); },
    async long(x, y, ms = 700) { await send('touchStart', [{ x, y }]); await sleep(ms); await send('touchEnd', []); await sleep(80); },
    async drag(a, b, { n = 14, dt = 18, hold = 60 } = {}) {
      await send('touchStart', [a]);
      for (let i = 1; i <= n; i++) { await send('touchMove', [{ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }]); await sleep(dt); }
      if (hold) await sleep(hold);
      await send('touchEnd', []); await sleep(60);
    },
  };
}

export async function runLayoutBChecks({ browser, url, check, todo = check, only }) {
  mkdirSync(outDir, { recursive: true });
  for (const [name, opts] of LB_PROFILES.filter(([n]) => !only || n === only)) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);
    await phoneChecks(page, name, check, todo, opts.viewport.height > opts.viewport.width);
    check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove della disposizione B${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  if (!only || only === 'desktop') await desktopChecks(browser, url, check);
}

async function phoneChecks(page, name, check, todo, portrait) {
  const cdp = await page.context().newCDPSession(page);
  const F = fingers(cdp);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const st = () => ev(() => window.__lb.st());
  const shot = what => page.screenshot({ path: path.join(outDir, `layoutb-${name}-${what}.png`) });
  const hs = [];
  const noScroll = async where => { if (await ev(() => window.__lb.hscroll())) hs.push(where); };
  // Tocco sul centro di un elemento (dopo averlo portato in vista); restituisce il rettangolo, null se coperto.
  const tapEl = async (sel, wait = 120) => {
    const r = await ev(s => window.__lb.rect(s), sel);
    if (!r || !r.hit) return null;
    await F.tap(r.x, r.y); await sleep(wait);
    return r;
  };
  const reset = async seed => {
    const r = await ev(s => window.__lb.reset(s), seed);
    await page.waitForFunction(() => !document.documentElement.classList.contains('dopen') && document.getElementById('placebar').hidden);
    await sleep(300);
    return r;
  };
  const settle = () => sleep(380); // lo scorrimento del cassetto dura 0,24 s

  // 1. Disposizione a riposo: classi, barra a destra (in verticale in basso), nessuna sovrapposizione, bersagli ≥ 48 px.
  {
    await reset(12345);
    const L = await ev(lbLayout);
    check(L.lb && L.lbv === portrait, `${name}: si usa la disposizione B${portrait ? ' in verticale' : ''} (classi ${L.lb ? 'lb' : '—'}${L.lbv ? ' lbv' : ''})`);
    const bar = L.parts.barra || [0, 0, 0, 0];
    const railOk = portrait ? Math.abs(bar[1] + bar[3] - L.vh) <= 1 && Math.abs(bar[2] - L.vw) <= 1 && bar[3] >= 52 && bar[3] <= 80
      : Math.abs(bar[0] + bar[2] - L.vw) <= 1 && Math.abs(bar[2] - 66) <= 2 && Math.abs(bar[3] - L.vh) <= 1;
    check(railOk, `${name}: la barra delle schede sta ${portrait ? 'in basso, larga quanto lo schermo' : 'a destra, larga 66 px e alta quanto lo schermo'} (${bar.join(', ')})`);
    check(!L.overlaps.length && !L.outside.length && L.drawerHidden && !L.open && L.mapFree,
      `${name}: a cassetto chiuso striscia, riquadro della selezione, ordini, minimappa e barra non si sovrappongono e stanno nello schermo, la mappa è libera (${L.overlaps.length ? 'sovrapposti: ' + L.overlaps.join(', ') : 'nessuna sovrapposizione'}${L.outside.length ? '; fuori: ' + L.outside.join(', ') : ''})`);
    const rail = await ev(() => [...document.querySelectorAll('#tabs > button')].map(b => { const r = b.getBoundingClientRect(); return { k: b.dataset.tab || b.id, w: Math.round(r.width), h: Math.round(r.height) }; }));
    const want = ['build', 'prod', 'res', 'des', 'btnAlarm', 'menu'];
    const small = rail.filter(b => b.w < 48 || b.h < 48);
    check(JSON.stringify(rail.map(b => b.k)) === JSON.stringify(want) && !small.length,
      `${name}: la barra ha Costruisci, Produci, Ricerca, Progetta, Allarme e Menu, tutti di almeno 48×48 px (${rail.map(b => `${b.k} ${b.w}×${b.h}`).join(', ')})`);
    const hidden = await ev(() => ['btnSound', 'btnHelp', 'btnExit', 'btnPause', 'btnSpeed'].filter(id => { const el = document.getElementById(id), b = el.getBoundingClientRect(); const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return getComputedStyle(document.getElementById('drawer')).visibility === 'hidden' && el.closest('#drawMenu') && !(top === el || el.contains(top)); }));
    check(hidden.length === 5, `${name}: Suono, Velocità, Pausa, Comandi ed Esci stanno nel cassetto «Menu», nascosti finché è chiuso (${hidden.join(', ')})`);
    await shot('mappa');
    await noScroll('a riposo');
  }

  // 2. Ogni cassetto si apre con la sua scheda e si chiude con la scheda, con ✕ e scorrendolo verso il bordo.
  const tileSizes = [];
  for (const t of ['build', 'prod', 'res', 'des', 'menu']) {
    const bad = [];
    for (const how of ['scheda', '✕', 'scorrimento']) {
      const r = await tapEl(`#tabs [data-tab="${t}"]`);
      await settle();
      const a = await st();
      const vw = await ev(() => innerWidth), vh = await ev(() => innerHeight);
      const size = portrait ? Math.abs(a.box.w - vw) <= 1 && a.box.h / vh >= 0.4 && a.box.h / vh <= 0.62 : a.box.w / vw >= 0.33 && a.box.w / vw <= 0.6 && Math.abs(a.box.h - vh) <= 1;
      const okOpen = r && a.drawer === t && a.open && a.vis === 'visible' && a.title === TITLES[t] && a.on.join() === t && a.exp.join() === t && size;
      if (!okOpen) { bad.push(`apertura (${how}): cassetto ${a.drawer}, visibile ${a.vis}, titolo «${a.title}», scheda accesa ${a.on.join()}, misura ${Math.round(a.box.w)}×${Math.round(a.box.h)}${r ? '' : ', scheda coperta'}`); }
      if (how === 'scheda') {
        // la mappa accanto (o sopra) al cassetto resta toccabile
        const free = await ev(b => { const x = innerHeight > innerWidth ? innerWidth / 2 : b.x / 2, y = innerHeight > innerWidth ? b.y / 2 : innerHeight / 2; return document.elementFromPoint(x, y) === document.getElementById('view'); }, a.box);
        if (!free) bad.push('la mappa accanto al cassetto non è toccabile');
        const L = await ev(lbLayout);
        if (L.overlaps.length || L.outside.length) bad.push(`con il cassetto aperto: sovrapposti ${L.overlaps.join(', ')}${L.outside.length ? ', fuori ' + L.outside.join(', ') : ''}`);
        await noScroll(`cassetto ${t}`);
        if (t !== 'menu') tileSizes.push(...await ev(() => [...document.querySelectorAll('#drawer .tile')].map(e => { const b = e.getBoundingClientRect(); return [e.dataset.type || e.dataset.i || e.dataset.id || e.dataset.v || '?', Math.round(b.width), Math.round(b.height)]; })));
        if (t === 'menu') {
          const vis = await ev(() => ['btnSound', 'btnSpeed', 'btnPause', 'btnHelp', 'btnExit'].map(id => { const el = document.getElementById(id), b = el.getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return top === el || el.contains(top) ? '' : id; }).filter(Boolean));
          if (vis.length) bad.push(`nel cassetto Menu non si toccano: ${vis.join(', ')}`);
        }
        await shot(`cassetto-${t}`);
      }
      if (how === 'scheda') await tapEl(`#tabs [data-tab="${t}"]`);
      else if (how === '✕') await tapEl('#drawClose');
      else {
        const h = await ev(() => window.__lb.rect('#drawTitle'));
        const to = portrait ? { x: h.x, y: h.y + 220 } : { x: h.x + 200, y: h.y };
        await F.drag({ x: h.x, y: h.y }, to, { n: 10, dt: 16, hold: 0 });
      }
      await settle();
      const b = await st();
      if (b.drawer !== null || b.open || b.vis !== 'hidden' || b.on.length) bad.push(`chiusura con ${how}: cassetto ${b.drawer}, visibile ${b.vis}`);
    }
    check(!bad.length, `${name}: il cassetto «${TITLES[t]}» si apre con la scheda e si chiude con la scheda, con ✕ e scorrendolo${bad.length ? ' — ' + bad.join('; ') : ''}`);
  }
  const smallTiles = tileSizes.filter(([, w, h]) => w < 64 || h < 64);
  check(tileSizes.length >= 20 && !smallTiles.length, `${name}: le ${tileSizes.length} tessere dei cassetti sono di almeno 64×64 px (la più piccola ${Math.min(...tileSizes.map(s => s[1]))}×${Math.min(...tileSizes.map(s => s[2]))}${smallTiles.length ? '; piccole: ' + smallTiles.slice(0, 4).map(s => `${s[0]} ${s[1]}×${s[2]}`).join(', ') : ''})`);

  // 3. Tocco su una propria fabbrica: si apre Produci su quella fabbrica (non sulla prima); il laboratorio apre Ricerca.
  const s3 = await (async () => {
    await reset(12345);
    return ev(() => {
      const L = window.__lb, E = window.__wz.engine;
      const f1 = L.spots('factory')[0]; const a = E.makeStruct('factory', 0, f1.tx, f1.ty, true);
      const f2 = L.spots('factory', [{ x: a.x, y: a.y, d: 4 * 32 }])[0]; const b = E.makeStruct('factory', 0, f2.tx, f2.ty, true);
      const l = L.spots('lab', [{ x: b.x, y: b.y, d: 3 * 32 }])[0]; const lab = E.makeStruct('lab', 0, l.tx, l.ty, true);
      E.updateFog();
      return { f1: a.id, f2: b.id, fx: b.x, fy: b.y, lab: lab.id, lx: lab.x, ly: lab.y };
    });
  })();
  {
    const p = await ev(([x, y]) => window.__lb.scr(x, y), [s3.fx, s3.fy]);
    if (p.onMap) await F.tap(p.x, p.y);
    await settle();
    const a = await st();
    const ui = await ev(() => ({ chip: +(document.querySelector('#drawer .chip.on') || { dataset: {} }).dataset.id, tiles: document.querySelectorAll('#drawer [data-act="prod"]').length }));
    const above = portrait ? await ev(([x, y, top]) => window.__lb.scr(x, y).y < top, [s3.fx, s3.fy, a.box.y]) : true;
    check(p.onMap && a.drawer === 'prod' && a.producer === s3.f2 && ui.chip === s3.f2 && ui.tiles > 0 && a.sel.join() === String(s3.f2) && above,
      `${name}: un tocco sulla seconda fabbrica apre Produci su quella (cassetto ${a.drawer}, fabbrica ${a.producer}/${s3.f2}, scheda accesa ${ui.chip}, ${ui.tiles} tessere${portrait ? `, fabbrica ${above ? 'in vista sopra' : 'nascosta sotto'} il cassetto` : ''}${p.onMap ? '' : ', punto coperto da ' + p.under})`);
  }

  // 4. Produci dal cassetto: 3 tocchi = 3 mezzi in coda e il gasolio scende; tocco sulla coda = tolto con rimborso;
  //    tocco lungo = 5 in coda.
  {
    const c = await ev(() => { const E = window.__wz.engine; E.S.res[0] = 2000; window.__wz.ui.key = ''; return E.dStats(E.S.designs[0], 0).cost; });
    await sleep(300);
    for (let i = 0; i < 3; i++) await tapEl('#drawer [data-act="prod"][data-i="0"]', 200);
    await sleep(350);
    const a = await ev(id => ({ q: window.__wz.engine.ent(id).queue.length, res: window.__wz.engine.S.res[0], badge: (document.querySelector('#drawer [data-act="prod"][data-i="0"] .badge') || {}).textContent, dres: document.getElementById('drawRes').textContent.replace(/\D/g, ''), qt: document.querySelectorAll('#drawer .qt[data-act="cancel"]').length }), s3.f2);
    check(a.q === 3 && a.res === 2000 - 3 * c && a.badge === '3' && a.dres === String(a.res) && a.qt === 3,
      `${name}: tre tocchi sulla tessera mettono 3 mezzi in coda e il gasolio scende di ${3 * c} (coda ${a.q}, gasolio ${a.res}, nel cassetto ${a.dres}, numero sulla tessera ${a.badge})`);
    const qs = await ev(() => { const r = window.__lb.rect('#drawer .qt[data-act="cancel"]'); return r && [r.w, r.h].map(Math.round); });
    await tapEl('#drawer .qt[data-act="cancel"][data-i="0"]', 200);
    await sleep(200);
    const b = await ev(id => ({ q: window.__wz.engine.ent(id).queue.length, res: window.__wz.engine.S.res[0] }), s3.f2);
    check(b.q === 2 && b.res === a.res + c, `${name}: un tocco su un mezzo della coda lo toglie e rimborsa ${c} (coda ${a.q} → ${b.q}, gasolio ${a.res} → ${b.res})`);
    check(qs && qs[0] >= 48 && qs[1] >= 48, `${name}: gli elementi della coda sono bersagli di almeno 48×48 px (${qs && qs.join('×')})`);
    for (let i = 0; i < 2; i++) await tapEl('#drawer .qt[data-act="cancel"][data-i="0"]', 200);
    await sleep(200);
    const r0 = await ev(id => ({ q: window.__wz.engine.ent(id).queue.length, res: window.__wz.engine.S.res[0] }), s3.f2);
    const t = await ev(() => window.__lb.rect('#drawer [data-act="prod"][data-i="0"]'));
    if (t && t.hit) await F.long(t.x, t.y, 700);
    await sleep(350);
    const l = await ev(id => ({ q: window.__wz.engine.ent(id).queue.length, res: window.__wz.engine.S.res[0], toast: window.__lb.toasts(), badge: (document.querySelector('#drawer [data-act="prod"][data-i="0"] .badge') || {}).textContent }), s3.f2);
    check(r0.q === 0 && r0.res === 2000 && t && t.hit && l.q === 5 && l.res === 2000 - 5 * c && l.badge === '5' && /5 in coda/.test(l.toast),
      `${name}: un tocco lungo sulla tessera mette 5 mezzi in coda (coda ${r0.q} → ${l.q}, gasolio ${r0.res} → ${l.res}, avviso «${l.toast}»)`);
    await shot('produci');
  }

  // 5. Selezione e ordine con il cassetto aperto: la mappa libera accanto (in verticale sopra) resta giocabile.
  {
    const s = await ev(() => {
      const L = window.__lb, W = window.__wz, E = W.engine, b = document.getElementById('drawer').getBoundingClientRect();
      const v = innerHeight > innerWidth;
      const px = v ? innerWidth * 0.3 : b.left * 0.3, py = v ? (60 + b.top - 70) / 2 : innerHeight * 0.45;
      const w = L.world(px, py), p = L.free(Math.floor(w.x / 32), Math.floor(w.y / 32));
      const u = E.makeUnit(0, { c: 'L', p: 'W', w: 'MG' }, p.x, p.y); u.order = { t: 'idle' };
      const g = L.free(p.tx + 3, p.ty); E.updateFog();
      return { id: u.id, ux: p.x, uy: p.y, gx: g.x, gy: g.y };
    });
    const a = await ev(([x, y]) => window.__lb.scr(x, y), [s.ux, s.uy]);
    if (a.onMap) await F.tap(a.x, a.y);
    await sleep(450); // oltre il doppio tocco
    const sel = (await st()).sel;
    const b = await ev(([x, y]) => window.__lb.scr(x, y), [s.gx, s.gy]);
    if (b.onMap) await F.tap(b.x, b.y);
    await sleep(150);
    const o = await ev(id => window.__wz.engine.ent(id).order, s.id);
    const z = await st();
    check(a.onMap && b.onMap && sel.join() === String(s.id) && o.t === 'move' && Math.hypot(o.x - s.gx, o.y - s.gy) <= 32 && z.drawer === 'prod' && z.open,
      `${name}: con il cassetto Produci aperto si seleziona un mezzo e gli si dà un ordine sulla mappa (selezione ${JSON.stringify(sel)}, ordine ${o.t}, cassetto ${z.drawer}${a.onMap && b.onMap ? '' : ', punto coperto da ' + (a.onMap ? b.under : a.under)})`);
  }

  // 6. Tocco sul laboratorio: si apre Ricerca; una ricerca si avvia dal cassetto.
  {
    await tapEl('#drawClose'); await settle();
    await ev(() => { window.__wz.ui.sel = []; window.__wz.ui.key = ''; });
    const p = await ev(([x, y]) => window.__lb.scr(x, y), [s3.lx, s3.ly]);
    if (p.onMap) await F.tap(p.x, p.y);
    await settle();
    const a = await st();
    check(p.onMap && a.drawer === 'res' && a.sel.join() === String(s3.lab), `${name}: un tocco sul laboratorio apre Ricerca (cassetto ${a.drawer}${p.onMap ? '' : ', punto coperto da ' + p.under})`);
    await ev(() => { window.__wz.engine.S.res[0] = 1000; window.__wz.ui.key = ''; }); await sleep(300);
    const id = await ev(() => { const b = document.querySelector('#drawer [data-act="research"]:not([disabled])'); return b ? b.dataset.id : null; });
    const cost = id ? await ev(i => window.__wz.engine.TECH_BY[i].cost, id) : 0;
    if (id) await tapEl(`#drawer [data-act="research"][data-id="${id}"]`, 300);
    const r = await ev(([lab, i]) => ({ rs: window.__wz.engine.ent(lab).rs, res: window.__wz.engine.S.res[0], stl: (document.querySelector(`#drawer [data-act="research"][data-id="${i}"] .stl`) || {}).textContent }), [s3.lab, id]);
    check(id && r.rs && r.rs.id === id && r.res === 1000 - cost && /In corso/.test(r.stl || ''), `${name}: dal cassetto Ricerca si avvia una ricerca (${id}: ${r.rs ? 'in corso' : 'non partita'}, gasolio 1000 → ${r.res}, «${r.stl}»)`);
    await shot('ricerca');
  }

  // 7. Progetta: si compone un mezzo nuovo con le tessere e si salva.
  {
    // ricerche del livello II fatte: telaio medio e semicingoli si sbloccano
    await ev(() => { const E = window.__wz.engine; E.S.tech[0].chM = true; E.S.tech[0].prHT = true; window.__wz.ui.key = ''; });
    await tapEl('#tabs [data-tab="des"]'); await settle();
    const want = await ev(() => {
      const E = window.__wz.engine, ok = (t, k) => !t[k].req || E.S.tech[0][t[k].req];
      const cs = Object.keys(E.CHASSIS).filter(k => ok(E.CHASSIS, k)), ps = Object.keys(E.PROPS).filter(k => ok(E.PROPS, k)), ws = Object.keys(E.WEAPONS).filter(k => ok(E.WEAPONS, k));
      // il progetto non ancora salvato che cambia più parti rispetto alla bozza iniziale (Leggero, Ruote, MG)
      let best = null, bd = 0;
      for (const c of cs) for (const p of ps) for (const w of ws) {
        const diff = (c !== 'L') + (p !== 'W') + (w !== 'MG');
        if (diff > bd && !E.S.designs.some(d => d.c === c && d.p === p && d.w === w)) { best = { c, p, w, n: E.S.designs.length }; bd = diff; }
      }
      return best;
    });
    if (want) for (const k of ['c', 'p', 'w']) if (want[k] !== { c: 'L', p: 'W', w: 'MG' }[k]) await tapEl(`#drawer [data-act="dpart"][data-k="${k}"][data-v="${want[k]}"]`, 150);
    await tapEl('#drawer [data-act="dsave"]', 200);
    const r = await ev(() => ({ ds: window.__wz.engine.S.designs.map(d => d.c + d.p + d.w), draft: window.__wz.ui.draft, save: (document.querySelector('#drawer [data-act="dsave"]') || {}).textContent }));
    check(want && r.ds.length === want.n + 1 && r.ds.includes(want.c + want.p + want.w) && r.save === 'Progetto già salvato',
      `${name}: in Progetta si sceglie ${want ? want.c + want.p + want.w : '—'} con le tessere e «Salva il progetto» lo aggiunge (progetti ${r.ds.join(', ')}, pulsante «${r.save}»)`);
    await shot('progetta');
  }

  // 8. Costruisci senza geniere selezionato: «Seleziona i genieri liberi» prende solo quelli senza cantiere.
  let s8;
  {
    await reset(12345);
    s8 = await ev(() => {
      const L = window.__lb, W = window.__wz, E = W.engine, b0 = E.S.ents.find(e => e.owner === 0 && e.builder);
      const p1 = L.free(Math.floor(b0.x / 32) + 1, Math.floor(b0.y / 32) + 2), p2 = L.free(Math.floor(b0.x / 32) - 1, Math.floor(b0.y / 32) + 2);
      const b1 = E.makeUnit(0, null, p1.x, p1.y), b2 = E.makeUnit(0, null, p2.x, p2.y);
      const d = E.deposits.filter(d => E.explored[d.x + d.y * E.MW] && E.canPlace(0, 'pump', d.x, d.y))[0];
      const s = E.placeStruct(0, 'pump', d.x, d.y); E.cmdBuild([b1], s);
      // liberi: tutti i genieri tranne quello mandato al cantiere della pompa
      return { free: E.S.ents.filter(e => e.owner === 0 && e.builder && !e.dead && e.id !== b1.id).map(e => e.id).sort((a, b) => a - b), busy: b1.id };
    });
    await tapEl('#tabs [data-tab="build"]'); await settle();
    const before = await ev(() => ({ txt: (document.querySelector('#drawer [data-act="selfree"]') || {}).textContent, dis: [...document.querySelectorAll('#drawer [data-act="place"]')].every(b => b.disabled) }));
    await tapEl('#drawer [data-act="selfree"]', 300);
    const a = await st();
    const after = await ev(() => ({ fac: !document.querySelector('#drawer [data-act="place"][data-type="factory"]').disabled, nob: !!document.querySelector('#drawer [data-act="selfree"]') }));
    check(before.txt === `Seleziona i genieri liberi (${s8.free.length})` && s8.free.length >= 2 && !a.sel.includes(s8.busy) && before.dis && a.sel.join() === s8.free.join() && after.fac && !after.nob && a.drawer === 'build',
      `${name}: senza geniere Costruisci offre «${before.txt}»; toccato seleziona i ${a.sel.length} genieri liberi (non quello al cantiere) e le tessere si accendono (selezione ${JSON.stringify(a.sel)}, attesa ${JSON.stringify(s8.free)})`);
  }

  // 9. Piazzamento con conferma: l'edificio parte dal centro, si trascina, un tocco lo sposta, il posto sbagliato è
  //    rosso con il motivo e ✓ non costruisce; ✓ su un posto buono avvia il cantiere.
  {
    await ev(() => { window.__wz.engine.S.res[0] = 1000; window.__wz.ui.key = ''; }); await sleep(300);
    const n0 = await ev(() => window.__wz.engine.S.ents.filter(e => e.type === 'factory' && !e.dead).length);
    await tapEl('#drawer [data-act="place"][data-type="factory"]');
    await settle();
    const a = await ev(() => {
      const W = window.__wz, L = window.__lb, cv = document.getElementById('view').getBoundingClientRect(), g = W.ui.ghost;
      const ok = document.getElementById('btnPlaceOk').getBoundingClientRect(), no = document.getElementById('btnPlaceNo').getBoundingClientRect();
      const s = g && L.scr(g.x, g.y);
      return { placing: W.ui.placing, drawer: W.ui.drawer, open: document.documentElement.classList.contains('dopen'), bar: !document.getElementById('placebar').hidden, bad: document.getElementById('placebar').classList.contains('bad'),
        info: document.getElementById('pbInfo').textContent, g, gs: s, d: s ? Math.hypot(s.x - (cv.left + cv.width / 2), s.y - (cv.top + cv.height / 2)) : -1,
        ok: [ok.width, ok.height].map(Math.round), no: [no.width, no.height].map(Math.round), orders: getComputedStyle(document.getElementById('touchbar')).visibility };
    });
    check(a.placing === 'factory' && !a.drawer && !a.open && a.bar && a.g && a.d < 200 && !a.bad && /Trascina/.test(a.info),
      `${name}: toccare la tessera Fabbrica chiude il cassetto e l’edificio compare al centro della mappa (a ${Math.round(a.d)} px dal centro), posto valido («${a.info}»)`);
    check(a.ok[0] >= 64 && a.ok[1] >= 64 && a.no[0] >= 48 && a.no[1] >= 48 && a.orders === 'hidden', `${name}: durante il piazzamento ✓ è di ${a.ok.join('×')} px, ✕ di ${a.no.join('×')} px e gli ordini rapidi si nascondono (${a.orders})`);
    const L0 = await ev(lbLayout);
    check(!L0.overlaps.length && !L0.outside.length, `${name}: durante il piazzamento barra del piazzamento, ✓, ✕, minimappa, striscia e barra non si sovrappongono (${L0.overlaps.join(', ') || 'nessuna sovrapposizione'})`);
    await noScroll('piazzamento');
    // trascinamento verso un posto valido a qualche casella di distanza
    const hq = await ev(() => { const h = window.__wz.engine.S.ents.find(e => e.type === 'hq' && e.owner === 0); return { x: h.x, y: h.y }; });
    const sp = await ev(([g, hq]) => window.__lb.spots('factory', [{ x: g.x, y: g.y, d: 3 * 32 }, { x: hq.x, y: hq.y, d: 5 * 32 }]), [a.g, hq]);
    const t1 = sp.sort((p, q) => Math.hypot(p.x - a.g.x, p.y - a.g.y) - Math.hypot(q.x - a.g.x, q.y - a.g.y))[0];
    if (t1) await F.drag({ x: a.gs.x, y: a.gs.y }, { x: a.gs.x + (t1.x - a.g.x), y: a.gs.y + (t1.y - a.g.y) });
    await sleep(150);
    const d1 = await ev(() => { const g = window.__wz.ui.ghost; return { g: { ...g }, t: window.__lb.tileOf('factory', g.x, g.y), bad: document.getElementById('placebar').classList.contains('bad'), placing: window.__wz.ui.placing, cam: { ...window.__wz.cam } }; });
    check(t1 && d1.t[0] === t1.tx && d1.t[1] === t1.ty && !d1.bad && d1.placing === 'factory',
      `${name}: trascinata con un dito, la fabbrica va nella casella scelta (${d1.t.join(',')}, attesa ${t1 ? t1.tx + ',' + t1.ty : '—'}) e non si costruisce ancora`);
    // un tocco altrove la sposta lì
    const t2 = sp.filter(p => Math.hypot(p.x - t1.x, p.y - t1.y) >= 5 * 32).sort((p, q) => Math.hypot(q.x - t1.x, q.y - t1.y) - Math.hypot(p.x - t1.x, p.y - t1.y))[0];
    const p2 = t2 && await ev(([x, y]) => window.__lb.scr(x, y), [t2.x, t2.y]);
    if (p2 && p2.onMap) await F.tap(p2.x, p2.y);
    await sleep(150);
    const d2 = await ev(() => { const g = window.__wz.ui.ghost; return { t: window.__lb.tileOf('factory', g.x, g.y), n: window.__wz.engine.S.ents.filter(e => e.type === 'factory' && !e.dead).length }; });
    check(t2 && p2.onMap && d2.t[0] === t2.tx && d2.t[1] === t2.ty && d2.n === n0, `${name}: un tocco altrove sulla mappa sposta lì la fabbrica (${d2.t.join(',')}, attesa ${t2 ? t2.tx + ',' + t2.ty : '—'}) senza costruirla`);
    // sopra il comando: rosso, con il motivo; ✓ non costruisce
    const gs2 = await ev(() => { const g = window.__wz.ui.ghost; return window.__lb.scr(g.x, g.y); });
    const hqs = await ev(([x, y]) => window.__lb.scr(x, y), [hq.x, hq.y]);
    await F.drag({ x: gs2.x, y: gs2.y }, { x: hqs.x, y: hqs.y });
    await sleep(200);
    const bad = await ev(async () => {
      const W = window.__wz, E = W.engine, D = E.STRUCTS.factory, T = E.TILE, g = document.getElementById('view').getContext('2d');
      const seen = [];
      g.fillRect = function (x, y, w, h) { if (Math.abs(w - D.w * T) < 0.01 && Math.abs(h - D.h * T) < 0.01) seen.push(String(this.fillStyle)); return CanvasRenderingContext2D.prototype.fillRect.call(this, x, y, w, h); };
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      delete g.fillRect;
      const pb = document.getElementById('placebar'), info = document.querySelector('#placebar .pbinfo'), wn = document.querySelector('#placebar .pbw');
      return { bad: pb.classList.contains('bad'), info: document.getElementById('pbInfo').textContent, okDis: document.getElementById('btnPlaceOk').getAttribute('aria-disabled'),
        border: getComputedStyle(info).borderLeftColor, color: getComputedStyle(wn).color, fills: seen };
    });
    const rgb = s => (s.match(/[\d.]+/g) || []).map(Number);
    const red = s => { const [r, g] = rgb(s); return r > g + 60; };
    check(hqs.onMap && bad.bad && /Qui non si può: c’è già qualcosa/.test(bad.info) && bad.okDis === 'true' && red(bad.border) && red(bad.color) && bad.fills.some(red),
      `${name}: sopra il comando la fabbrica è segnata in rosso sulla mappa e nella barra con il motivo («${bad.info}», bordo ${bad.border}, sagoma ${bad.fills.join(' ') || 'non disegnata'})`);
    const res0 = (await st()).res;
    await tapEl('#btnPlaceOk', 200);
    const nb = await ev(() => ({ n: window.__wz.engine.S.ents.filter(e => e.type === 'factory' && !e.dead).length, placing: window.__wz.ui.placing, res: window.__wz.engine.S.res[0], toast: window.__lb.toasts() }));
    check(nb.n === n0 && nb.placing === 'factory' && nb.res === res0 && /Qui non si può/.test(nb.toast), `${name}: ✓ su un posto non valido non costruisce e lo dice («${nb.toast}»)`);
    await shot('piazzamento-rosso');
    // di nuovo sul posto buono, poi ✓: cantiere, geniere al lavoro, gasolio speso
    await F.drag({ x: hqs.x, y: hqs.y }, { x: p2.x, y: p2.y });
    await sleep(200);
    const back = await ev(() => { const g = window.__wz.ui.ghost; return { t: window.__lb.tileOf('factory', g.x, g.y), bad: document.getElementById('placebar').classList.contains('bad') }; });
    await shot('piazzamento');
    await tapEl('#btnPlaceOk', 250);
    const done = await ev(([t, ids]) => {
      const E = window.__wz.engine, f = E.S.ents.find(e => e.type === 'factory' && e.owner === 0 && !e.dead && e.tx === t.tx && e.ty === t.ty);
      return { f: f ? { id: f.id, built: f.built } : null, orders: ids.map(id => E.ent(id).order), res: E.S.res[0], placing: window.__wz.ui.placing, ghost: window.__wz.ui.ghost, bar: document.getElementById('placebar').hidden };
    }, [t2, s8.free]);
    check(back.t[0] === t2.tx && back.t[1] === t2.ty && !back.bad && done.f && done.f.built < 1 && done.orders.every(o => o.t === 'build' && o.id === done.f.id) && done.res === res0 - 200 && !done.placing && !done.ghost && done.bar,
      `${name}: ✓ avvia il cantiere della fabbrica nella casella scelta (${done.f ? `fabbrica ${done.f.id} in ${t2.tx},${t2.ty}` : 'nessuna fabbrica'}, genieri: ${done.orders.map(o => o.t).join(', ')}, gasolio ${res0} → ${done.res})`);
  }

  // 10. ✕ annulla il piazzamento senza spendere nulla.
  {
    await tapEl('#tabs [data-tab="build"]'); await settle();
    const r0 = await ev(() => ({ res: window.__wz.engine.S.res[0], n: window.__wz.engine.S.ents.length }));
    await tapEl('#drawer [data-act="place"][data-type="lab"]'); await settle();
    const on = await ev(() => window.__wz.ui.placing);
    await tapEl('#btnPlaceNo', 200);
    const r1 = await ev(() => ({ res: window.__wz.engine.S.res[0], n: window.__wz.engine.S.ents.length, placing: window.__wz.ui.placing, ghost: window.__wz.ui.ghost, bar: document.getElementById('placebar').hidden, orders: getComputedStyle(document.getElementById('touchbar')).visibility }));
    check(on === 'lab' && !r1.placing && !r1.ghost && r1.bar && r1.res === r0.res && r1.n === r0.n && r1.orders === 'visible',
      `${name}: ✕ annulla il piazzamento del laboratorio senza spendere (gasolio ${r0.res} → ${r1.res}, entità ${r0.n} → ${r1.n}) e tornano gli ordini rapidi`);
  }

  // 11. Minimappa: il pulsante la ingrandisce e la rimpicciolisce; ingrandita resta nello schermo e non copre la barra.
  {
    const m0 = await ev(() => { const b = document.getElementById('mini').getBoundingClientRect(); return [b.width, b.height]; });
    await tapEl('#btnMiniBig', 200);
    const m1 = await ev(() => { const b = document.getElementById('mini').getBoundingClientRect(), mm = document.querySelector('.mm'); return { w: b.width, h: b.height, big: mm.classList.contains('big'), pressed: document.getElementById('btnMiniBig').getAttribute('aria-pressed') }; });
    const L = await ev(lbLayout);
    await shot('minimappa');
    await tapEl('#btnMiniBig', 200);
    const m2 = await ev(() => { const b = document.getElementById('mini').getBoundingClientRect(); return { w: b.width, big: document.querySelector('.mm').classList.contains('big') }; });
    const onOrders = L.overlaps.filter(o => /minimappa/.test(o) && /ordini|selezione/.test(o)), other = L.overlaps.filter(o => !onOrders.includes(o));
    check(Math.round(m0[0]) === 106 && m1.big && m1.pressed === 'true' && m1.w >= 1.5 * m0[0] && Math.abs(m1.w - m1.h) < 1 && !other.length && !L.outside.length && !m2.big && Math.abs(m2.w - m0[0]) < 1,
      `${name}: la minimappa (${Math.round(m0[0])} px) si ingrandisce a ${Math.round(m1.w)}×${Math.round(m1.h)} px nello schermo, senza coprire barra e striscia${other.length ? ' (sovrapposti: ' + other.join(', ') + ')' : ''}, e torna piccola (${Math.round(m2.w)} px)`);
    // Problema segnalato al frontend: ingrandita, la minimappa copre una parte degli ordini rapidi e delle squadre.
    todo(!onOrders.length, `${name}: ingrandita, la minimappa non copre ordini rapidi e squadre${onOrders.length ? ' (copre: ' + onOrders.join(', ') + ')' : ''}`);
  }
  check(!hs.length, `${name}: nessuno scorrimento orizzontale della pagina, nemmeno con i cassetti aperti e durante il piazzamento${hs.length ? ' (scorre: ' + hs.join(', ') + ')' : ''}`);
}

// Computer: la plancia classica resta com'era (misure dei riquadri, niente barra laterale né cassetto).
async function desktopChecks(browser, url, check) {
  const name = 'desktop';
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url); await page.waitForTimeout(300);
  await page.locator('#ovStart').click(); await page.waitForTimeout(400);
  const m = await page.evaluate(keys => {
    const out = {};
    for (const s of keys) { const el = document.querySelector(s); const b = el ? el.getBoundingClientRect() : null; out[s] = b ? [b.left, b.top, b.width, b.height].map(v => Math.round(v * 10) / 10) : null; }
    const d = id => getComputedStyle(document.getElementById(id)).display;
    return {
      out, cls: document.documentElement.className.trim(), drawer: d('drawer'), menu: d('btnMenu'), big: d('btnMiniBig'), place: document.getElementById('placebar').hidden,
      homes: [['barbtns', document.querySelector('.barbtns').parentElement.id], ['btnAlarm', document.getElementById('btnAlarm').parentElement.id], ['sel', document.getElementById('sel').parentElement.id], ['tabbody', document.getElementById('tabbody').parentElement.id]],
    };
  }, Object.keys(DESK_REF));
  const off = Object.entries(DESK_REF).filter(([k, v]) => {
    const g = m.out[k]; if (!g) return true;
    // la fila degli ordini cambia larghezza solo con le scritte: si confrontano posizione e altezza
    return v.some((x, i) => (k === '#touchbar' || k === '.barbtns') && i === 2 ? false : Math.abs(x - g[i]) > 1.5);
  }).map(([k]) => `${k} ${JSON.stringify(m.out[k])} invece di ${JSON.stringify(DESK_REF[k])}`);
  check(!off.length, `${name}: la plancia del computer a 1280×800 ha le stesse misure di prima (barra, mappa, pannello, minimappa, schede, ordini)${off.length ? ': ' + off.join('; ') : ''}`);
  check(!/\blb\b/.test(m.cls) && m.drawer === 'none' && m.menu === 'none' && m.big === 'none' && m.place && m.homes.every(([k, p]) => p === { barbtns: 'bar', btnAlarm: 'touchbar', sel: 'panel', tabbody: 'panel' }[k]),
    `${name}: sul computer niente barra laterale, cassetto, pulsante Menu né ingrandimento della minimappa; i pulsanti restano al loro posto (${m.homes.map(h => h.join('→')).join(', ')})`);
  await page.locator('#tabs [data-tab="prod"]').click(); await page.waitForTimeout(200);
  const t = await page.evaluate(() => ({ drawer: window.__wz.ui.drawer, tab: window.__wz.ui.tab, on: document.querySelector('#tabs [data-tab="prod"]').classList.contains('on'), tiles: document.querySelectorAll('#tabbody .tile').length, rows: document.querySelectorAll('#tabbody button[data-act="prod"], #tabbody button[data-act="prodb"]').length }));
  check(t.drawer === null && t.tab === 'prod' && t.on && t.tiles === 0 && t.rows > 0, `${name}: le schede del pannello si aprono nel pannello, con le righe di sempre e senza tessere (scheda ${t.tab}, ${t.rows} righe, ${t.tiles} tessere)`);
  await page.locator('#tabs [data-tab="build"]').click();
  await page.evaluate(() => { const W = window.__wz; W.ui.sel = W.engine.S.ents.filter(e => e.owner === 0 && e.builder).map(e => e.id); W.ui.key = ''; });
  await page.waitForTimeout(300);
  await page.locator('#tabbody [data-act="place"][data-type="factory"]').click(); await page.waitForTimeout(150);
  const p = await page.evaluate(() => ({ placing: window.__wz.ui.placing, ghost: window.__wz.ui.ghost, bar: document.getElementById('placebar').hidden }));
  await page.keyboard.press('Escape');
  check(p.placing === 'factory' && !p.ghost && p.bar, `${name}: sul computer l’edificio si sceglie dal pannello e si piazza con un clic, senza barra di conferma (piazzamento ${p.placing}, barra ${p.bar ? 'nascosta' : 'visibile'})`);
  check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove del computer invariato${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}

// Lancio da solo: node tests/e2e/layoutb.mjs (dopo npm run build). E2E_PROFILE=telefono-basso per un profilo solo.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const todo = (ok, msg) => console.log(`${ok ? 'ok  ' : 'TODO'} ${msg}`);
  const browser = await chromium.launch();
  await runLayoutBChecks({ browser, url, check, todo, only: process.env.E2E_PROFILE });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della disposizione B sono passati.');
}
