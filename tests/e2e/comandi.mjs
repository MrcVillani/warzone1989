// Prove dei comandi con un clic (fase A del piano 02), del pulsante «Suono» e di «riduci movimento».
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/comandi.mjs
// Ogni situazione si prepara con window.__wz (nuova partita, mezzi spostati al centro della mappa, gioco in pausa),
// poi si dà il comando con un vero clic del mouse o un tocco, e si legge l'ordine nello stato del motore.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { openMenu } from './layoutb.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

// Strumenti dentro la pagina: preparano le situazioni e convertono le coordinate del mondo in quelle dello schermo.
function installHelpers() {
  const W = window.__wz, E = W.engine, T = E.TILE;
  const cv = document.getElementById('view');
  const free = (tx, ty) => { const f = E.nearestFree(tx, ty, false); return { tx: f[0], ty: f[1], x: (f[0] + 0.5) * T, y: (f[1] + 0.5) * T }; };
  window.__t = {
    // Nuova partita in pausa, nessuna selezione, camera centrata su (cx, cy) in caselle.
    reset(seed, cx = 32, cy = 32) {
      E.newGame('normale', seed);
      Object.assign(W.ui, { sel: [], placing: null, amove: false, paused: true, mode: 'select', key: '' });
      W.fxs.shake = 0;
      const c = free(cx, cy);
      W.cam.x = c.x - cv.clientWidth / W.cam.z / 2; W.cam.y = c.y - cv.clientHeight / W.cam.z / 2;
      return c;
    },
    free,
    // Segna come esplorate le caselle attorno a (tx, ty): serve per piazzare edifici lontano dalla base.
    explore(tx, ty, r = 6) { for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) if (x >= 0 && y >= 0 && x < E.MW && y < E.MH) E.explored[x + y * E.MW] = 1; },
    // Porta un mezzo in (tx, ty) e aggiorna la nebbia.
    put(u, p) { u.x = p.x; u.y = p.y; u.gx = p.x; u.gy = p.y; u.path = null; u.order = { t: 'idle' }; E.updateFog(); return u.id; },
    armed: () => E.S.ents.filter(e => e.kind === 'unit' && e.owner === 0 && !e.dead && !e.builder),
    builder: () => E.S.ents.find(e => e.kind === 'unit' && e.owner === 0 && !e.dead && e.builder),
    // Punto dello schermo (coordinate della pagina) e cosa c'è sopra in quel punto.
    scr(wx, wy) {
      const r = cv.getBoundingClientRect();
      const x = r.left + (wx - W.cam.x) * W.cam.z, y = r.top + (wy - W.cam.y) * W.cam.z;
      const el = document.elementFromPoint(x, y);
      return { x, y, onMap: el === cv, under: el ? (el.id || el.className || el.tagName) : null };
    },
    ent: id => E.ent(id),
  };
}

// Clic o tocco su un punto del mondo; restituisce false se sopra c'è un altro elemento (pulsante, avviso).
async function hitWorld(page, touch, wx, wy) {
  const p = await page.evaluate(([x, y]) => window.__t.scr(x, y), [wx, wy]);
  if (!p.onMap) return p;
  if (touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(60);
  return p;
}

export async function runCommandChecks({ browser, url, check, profiles }) {
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const how = touch ? 'tocco' : 'clic';
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => { try { localStorage.removeItem('wz.sound'); localStorage.removeItem('wz.volume'); } catch (e) { /* niente */ } });
    await page.reload();
    await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);

    // 1. Selezione con un clic su un proprio mezzo, poi clic sinistro (o tocco) sul terreno = ordine «move».
    {
      const s = await page.evaluate(() => {
        const t = window.__t, c = t.reset(12345), u = t.armed()[0];
        t.put(u, c);
        const goal = t.free(c.tx + 3, c.ty + 1);
        return { id: u.id, ux: u.x, uy: u.y, gx: goal.x, gy: goal.y };
      });
      const a = await hitWorld(page, touch, s.ux, s.uy);
      const sel = await page.evaluate(() => window.__wz.ui.sel.slice());
      check(a.onMap && sel.length === 1 && sel[0] === s.id, `${name}: un ${how} su un proprio mezzo lo seleziona (selezione ${JSON.stringify(sel)}${a.onMap ? '' : ', punto coperto da ' + a.under})`);
      const b = await hitWorld(page, touch, s.gx, s.gy);
      const o = await page.evaluate(id => { const u = window.__t.ent(id); return { ...u.order, sel: window.__wz.ui.sel.length }; }, s.id);
      const near = o.x != null && Math.hypot(o.x - s.gx, o.y - s.gy) <= 32;
      check(b.onMap && o.t === 'move' && near && o.sel === 1,
        `${name}: un ${how} sul terreno con un mezzo selezionato lo manda lì (ordine ${o.t}, ${near ? 'verso il punto' : `meta (${o.x}, ${o.y}) invece di (${s.gx}, ${s.gy})`}), e la selezione resta`);
    }

    // 2. Clic su un nemico visibile = ordine «attack».
    {
      const s = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, c = t.reset(12345), u = t.armed()[0];
        t.put(u, c);
        const en = W.engine.S.ents.find(e => e.kind === 'unit' && e.owner === 1 && !e.builder);
        t.put(en, t.free(c.tx + 3, c.ty)); en.order = { t: 'idle' };
        W.ui.sel = [u.id];
        return { id: u.id, eid: en.id, ex: en.x, ey: en.y, seen: W.engine.canSee(0, en) };
      });
      const a = await hitWorld(page, touch, s.ex, s.ey);
      const o = await page.evaluate(id => window.__t.ent(id).order, s.id);
      check(s.seen && a.onMap && o.t === 'attack' && o.id === s.eid, `${name}: un ${how} su un nemico visibile dà l’ordine «attacca» (ordine ${o.t}, bersaglio ${o.id}/${s.eid})`);
    }

    // 3. Geniere selezionato + clic su un giacimento libero ed esplorato = pompa piazzata e in costruzione.
    {
      const s = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, E = W.engine, T = E.TILE;
        t.reset(12345);
        const d = E.deposits.slice().sort((a, b) => Math.hypot(a.x - 32, a.y - 32) - Math.hypot(b.x - 32, b.y - 32))[0];
        const b = t.builder();
        t.put(b, t.free(d.x - 2, d.y));
        W.cam.x = (d.x + 0.5) * T - document.getElementById('view').clientWidth / W.cam.z / 2;
        W.cam.y = (d.y + 0.5) * T - document.getElementById('view').clientHeight / W.cam.z / 2;
        W.ui.sel = [b.id];
        return { bid: b.id, dx: d.x, dy: d.y, wx: (d.x + 0.5) * T, wy: (d.y + 0.5) * T, explored: !!E.explored[d.x + d.y * E.MW], res: E.S.res[0] };
      });
      const a = await hitWorld(page, touch, s.wx, s.wy);
      const r = await page.evaluate(s => {
        const E = window.__wz.engine, p = E.S.ents.find(e => e.type === 'pump' && e.tx === s.dx && e.ty === s.dy && !e.dead);
        const b = window.__t.ent(s.bid);
        return { pump: p ? { id: p.id, owner: p.owner, built: p.built } : null, order: b.order, res: E.S.res[0] };
      }, s);
      check(s.explored && a.onMap && r.pump && r.pump.owner === 0 && r.order.t === 'build' && r.order.id === r.pump.id && r.res === s.res - 50,
        `${name}: con un geniere selezionato, un ${how} su un giacimento libero piazza una pompa e il geniere la costruisce (pompa ${r.pump ? r.pump.id : 'assente'}, ordine ${r.order.t})`);
    }

    // 4. Solo la fabbrica selezionata (con un clic) + clic sul terreno = punto di raduno.
    {
      const s = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, E = W.engine, T = E.TILE;
        const c = t.reset(12345); t.explore(c.tx, c.ty);
        let spot = null;
        for (let r = 0; r < 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if (E.canPlace(0, 'factory', c.tx - 1 + dx, c.ty - 1 + dy)) spot = [c.tx - 1 + dx, c.ty - 1 + dy];
        const f = E.makeStruct('factory', 0, spot[0], spot[1], true);
        const goal = t.free(spot[0] + 1, spot[1] + 4);
        W.cam.x = f.x - document.getElementById('view').clientWidth / W.cam.z / 2; W.cam.y = f.y - document.getElementById('view').clientHeight / W.cam.z / 2 + T;
        return { fid: f.id, fx: f.x, fy: f.y, gx: goal.x, gy: goal.y };
      });
      const a = await hitWorld(page, touch, s.fx, s.fy);
      const sel = await page.evaluate(() => window.__wz.ui.sel.slice());
      const b = await hitWorld(page, touch, s.gx, s.gy);
      const r = await page.evaluate(id => ({ rally: window.__t.ent(id).rally, sel: window.__wz.ui.sel.slice() }), s.fid);
      const ok = r.rally && Math.hypot(r.rally[0] - s.gx, r.rally[1] - s.gy) < 4;
      check(a.onMap && b.onMap && sel.length === 1 && sel[0] === s.fid && ok && r.sel[0] === s.fid,
        `${name}: con solo la fabbrica selezionata, un ${how} sul terreno imposta il raduno (selezione ${JSON.stringify(sel)}, raduno ${JSON.stringify(r.rally && r.rally.map(Math.round))})`);
    }

    // 5. Esc e «Deseleziona» deselezionano.
    {
      await page.evaluate(() => { const t = window.__t; t.reset(12345); window.__wz.ui.sel = t.armed().map(u => u.id); });
      await page.keyboard.press('Escape');
      const n1 = await page.evaluate(() => window.__wz.ui.sel.length);
      check(n1 === 0, `${name}: Esc deseleziona (${n1} selezionati dopo Esc)`);
      await page.evaluate(() => { window.__wz.ui.sel = window.__t.armed().map(u => u.id); });
      const desel = page.locator('#btnDesel');
      const vis = await desel.isVisible();
      if (vis) await desel.click();
      const n2 = await page.evaluate(() => window.__wz.ui.sel.length);
      check(vis && n2 === 0, `${name}: il pulsante «Deseleziona» è visibile e deseleziona (${n2} selezionati dopo)`);
    }

    // 6. «Tutto l'esercito» seleziona solo i mezzi armati del giocatore (non i genieri, non i nemici).
    {
      const want = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345);
        E.makeUnit(0, { c: 'L', p: 'W', w: 'CN' }, c.x, c.y);
        E.makeUnit(0, null, c.x + 40, c.y);
        W.ui.sel = [t.builder().id];
        return t.armed().map(u => u.id).sort((a, b) => a - b);
      });
      await page.locator('#btnArmy').click();
      const got = await page.evaluate(() => window.__wz.ui.sel.slice().sort((a, b) => a - b));
      check(JSON.stringify(got) === JSON.stringify(want) && want.length === 3,
        `${name}: «Tutto l’esercito» seleziona solo i ${want.length} mezzi armati (selezionati ${JSON.stringify(got)})`);
    }

    // 7. Suono: il pulsante cambia stato, lo ricorda dopo il ricaricamento, e con l'audio attivo niente errori.
    //    Su telefono (disposizione B) «Suono» sta nel cassetto «Menu»: prima si apre quello.
    {
      const b0 = await page.locator('#btnSound').getAttribute('aria-pressed');
      await openMenu(page);
      await page.locator('#btnSound').click();
      const b1 = await page.locator('#btnSound').getAttribute('aria-pressed');
      const st1 = await page.evaluate(() => window.__wz.audio().enabled);
      await page.reload(); await page.waitForTimeout(300);
      const b2 = await page.locator('#btnSound').getAttribute('aria-pressed');
      const st2 = await page.evaluate(() => window.__wz.audio().enabled);
      check(b0 === 'true' && b1 === 'false' && !st1 && b2 === 'false' && !st2,
        `${name}: «Suono» si spegne e resta spento dopo il ricaricamento (aria-pressed ${b0} → ${b1} → ${b2} dopo ricarica)`);
      await page.locator('#ovStart').click();
      await openMenu(page);
      await page.locator('#btnSound').click();
      const b3 = await page.locator('#btnSound').getAttribute('aria-pressed');
      await page.evaluate(installHelpers);
      // Battaglia vicina alla visuale con il suono acceso, dopo un gesto: spari di tutte le armi ed esplosioni.
      const au = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(4242);
        const ws = ['MG', 'CN', 'RK', 'MO'];
        for (let i = 0; i < 8; i++) {
          const a = t.free(c.tx - 2, c.ty - 4 + i), b = t.free(c.tx + 3, c.ty - 4 + i);
          E.makeUnit(0, { c: 'L', p: 'W', w: ws[i % 4] }, a.x, a.y);
          E.makeUnit(1, { c: 'M', p: 'HT', w: ws[(i + 1) % 4] }, b.x, b.y);
        }
        E.updateFog();
        W.ui.paused = false;
        return W.audio();
      });
      await page.mouse.move(5, 5); // un gesto in più non serve: il clic su «Suono» è già un gesto
      await page.waitForTimeout(2500);
      const au2 = await page.evaluate(() => { const a = window.__wz.audio(); window.__wz.ui.paused = true; return a; });
      check(b3 === 'true' && au2.enabled && au2.ctx !== 'none' && au2.played > au.played,
        `${name}: con il suono acceso l’audio parte dopo un gesto e suona la battaglia (contesto ${au2.ctx}, suoni ${au2.played}, scartati ${au2.dropped})`);
      check(errors.length === 0, `${name}: nessun errore JavaScript con l’audio attivo${errors.length ? ': ' + errors.join(' | ') : ''}`);
    }

    // 8. Scossa dello schermo: c'è per un'esplosione grande al centro della visuale (controllo di riferimento).
    {
      const sh = await page.evaluate(() => {
        const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345); t.explore(c.tx, c.ty);
        let spot = null;
        for (let r = 0; r < 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if (E.canPlace(0, 'lab', c.tx + dx, c.ty + dy)) spot = [c.tx + dx, c.ty + dy];
        // Edificio del giocatore (gli effetti del nemico nella nebbia non si mostrano).
        const s = E.makeStruct('lab', 0, spot[0], spot[1], true);
        W.cam.x = s.x - document.getElementById('view').clientWidth / W.cam.z / 2; W.cam.y = s.y - document.getElementById('view').clientHeight / W.cam.z / 2;
        E.updateFog();
        E.kill(s, 1);
        return W.fxs.shake;
      });
      check(sh > 0, `${name}: un edificio che esplode al centro della visuale scuote lo schermo (scossa ${sh.toFixed(2)} px)`);
    }
    await page.close();
  }

  // 9. Con «riduci movimento» del sistema nessuna scossa: né nello stato né nella trasformazione del canvas.
  for (const [name, opts] of profiles) {
    const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);
    const r = await page.evaluate(async () => {
      const t = window.__t, W = window.__wz, E = W.engine, c = t.reset(12345); t.explore(c.tx, c.ty, 10);
      const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const cv = document.getElementById('view'), g = cv.getContext('2d');
      // Trasformazione usata per disegnare il mondo: si legge intercettando setTransform durante un fotogramma.
      const seen = [];
      const orig = g.setTransform.bind(g);
      g.setTransform = (...a) => { seen.push([...a, W.cam.x, W.cam.y]); return orig(...a); };
      let max = 0;
      for (let i = 0; i < 6; i++) {
        let spot = null;
        for (let r = 0; r < 10 && !spot; r++) for (let dy = -r; dy <= r && !spot; dy++) for (let dx = -r; dx <= r && !spot; dx++) if (E.canPlace(0, 'lab', c.tx + dx, c.ty + dy)) spot = [c.tx + dx, c.ty + dy];
        const s = E.makeStruct('lab', 0, spot[0], spot[1], true);
        W.cam.x = s.x - cv.clientWidth / W.cam.z / 2; W.cam.y = s.y - cv.clientHeight / W.cam.z / 2;
        E.updateFog();
        E.kill(s, 1); E.explodeAt(s.x, s.y, 2, 1, 0, 2.5);
        max = Math.max(max, W.fxs.shake);
      }
      seen.length = 0;
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      g.setTransform = orig;
      // Il mondo si disegna con scala k = dpr·z e spostamento −camera·k: senza scossa lo spostamento è esatto.
      // (Si escludono le trasformazioni senza spostamento, usate per l'interfaccia sopra la mappa.)
      const world = seen.filter(a => a[1] === 0 && a[2] === 0 && a[0] === a[3] && (a[4] !== 0 || a[5] !== 0));
      const off = world.map(a => Math.hypot(a[4] + a[6] * a[0], a[5] + a[7] * a[0]));
      return { rm, max, frames: world.length, off: off.length ? Math.max(...off) : -1 };
    });
    check(r.rm && r.max === 0 && r.frames > 0 && r.off < 1e-6,
      `${name} (riduci movimento): nessuna scossa dello schermo dopo 6 esplosioni grandi (scossa ${r.max}, scarto del canvas ${r.off} px su ${r.frames} disegni)`);
    check(errors.length === 0, `${name} (riduci movimento): nessun errore JavaScript${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// Lancio da solo: node tests/e2e/comandi.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runCommandChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli dei comandi sono passati.');
}
