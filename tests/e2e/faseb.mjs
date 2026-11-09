// Prove della fase B del piano 02 nel browser: schede Ricerca (livelli I–IV), Progetta (parti bloccate, Mammut,
// cingoli rinforzati, obice, modulo riparazione) e Costruisci (bunker), battaglia con tutte le armi nuove e
// qualità adattiva degli effetti («Effetti» nella guida Comandi).
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/faseb.mjs
// Ogni situazione si prepara con window.__wz (nuova partita in pausa, laboratorio o fabbrica già pronti), poi si usa
// il pannello con un vero clic (computer) o tocco (telefono) e si legge il risultato nello stato del motore.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { openMenu } from './layoutb.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');

// Strumenti dentro la pagina.
function installHelpers() {
  const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
  const free = (tx, ty) => { const f = E.nearestFree(tx, ty, false); return { tx: f[0], ty: f[1], x: (f[0] + 0.5) * T, y: (f[1] + 0.5) * T }; };
  // Primo posto libero per un edificio vicino a (cx, cy), in caselle già esplorate.
  const spot = (type, cx, cy) => {
    for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (E.canPlace(0, type, cx + dx, cy + dy)) return [cx + dx, cy + dy];
    return null;
  };
  const center = (x, y) => { W.cam.x = x - cv.clientWidth / W.cam.z / 2; W.cam.y = y - cv.clientHeight / W.cam.z / 2; };
  window.__fb = {
    // Nuova partita come la avvia il client (startGame svuota anche i segnali della minimappa), ma senza copertina.
    fresh(seed) { E.newGame('normale', seed); W.fxs.pings.length = 0; },
    // Nuova partita in pausa, gasolio abbondante, pannello sulla scheda Costruisci, bozza di progetto iniziale.
    reset(seed = 12345) {
      this.fresh(seed);
      Object.assign(W.ui, { sel: [], placing: null, amove: false, paused: true, mode: 'select', key: '', tab: 'build', resFold: {}, draft: { c: 'L', p: 'W', w: 'MG' }, producer: 0 });
      W.fxs.shake = 0;
      E.S.res[0] = 20000;
      const b = E.B0;
      for (let y = b.y - 8; y <= b.y + 8; y++) for (let x = b.x - 8; x <= b.x + 8; x++) if (x >= 0 && y >= 0) E.explored[x + y * E.MW] = 1;
      center((b.x + 0.5) * T, (b.y + 0.5) * T);
    },
    // Edificio del giocatore già finito vicino al comando.
    struct(type) { const p = spot(type, E.B0.x + 3, E.B0.y + 1); return E.makeStruct(type, 0, p[0], p[1], true).id; },
    spot, free, center,
    lab: () => E.S.ents.find(e => e.owner === 0 && e.type === 'lab' && !e.dead),
    // Porta a termine la ricerca in corso nel laboratorio (un passo della simulazione).
    finish(id) { const l = E.ent(id); if (l && l.rs) { l.rs.t = l.rs.total; E.step(0.05); } return Object.keys(E.S.tech[0]); },
    builder: () => E.S.ents.find(e => e.kind === 'unit' && e.owner === 0 && !e.dead && e.builder),
    // Testo (senza spazi in eccesso) di un elemento del pannello.
    txt: sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; },
    scr(wx, wy) {
      const r = cv.getBoundingClientRect();
      const x = r.left + (wx - W.cam.x) * W.cam.z, y = r.top + (wy - W.cam.y) * W.cam.z;
      const el = document.elementFromPoint(x, y);
      return { x, y, onMap: el === cv, under: el ? (el.id || el.className || el.tagName) : null };
    },
    // Valori numerici non finiti (NaN, Infinity) nello stato, nei proiettili e negli effetti: percorsi dei primi 5.
    badNumbers() {
      const bad = [];
      const walk = (o, p, seen) => {
        if (bad.length >= 5 || o == null) return;
        if (typeof o === 'number') { if (!Number.isFinite(o)) bad.push(`${p}=${o}`); return; }
        if (typeof o !== 'object' || seen.has(o)) return;
        seen.add(o);
        if (o instanceof Map) { for (const [k, v] of o) walk(v, `${p}[${k}]`, seen); return; }
        if (ArrayBuffer.isView(o)) return; // mappe del terreno e della nebbia: non sono valori di gioco
        for (const k of Object.keys(o)) walk(o[k], `${p}.${k}`, seen);
      };
      const seen = new Set();
      walk(E.S, 'S', seen); walk(E.proj, 'proj', seen);
      walk({ parts: W.fxs.parts, fx: W.fxs.fx, wrecks: W.fxs.wrecks }, 'fxs', seen);
      walk(W.cam, 'cam', seen);
      return bad;
    },
  };
}

async function press(page, touch, sel) {
  const l = page.locator(sel).first();
  if (touch) await l.tap(); else await l.click();
  await page.waitForTimeout(80);
}
async function tab(page, touch, t) { await press(page, touch, `#tabs button[data-tab="${t}"]`); }

// Tutte le armi della fase B, con telai e propulsioni diversi.
const NEW_W = ['HMG', 'FL', 'RP', 'CN75', 'AT', 'CN105', 'HW', 'MRL'];
const ALL_W = [...NEW_W, 'MO', 'RK', 'CN', 'MG'];

export async function runPhaseBChecks({ browser, url, check, todo = check, profiles }) {
  mkdirSync(outDir, { recursive: true });
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch, how = touch ? 'tocco' : 'clic';
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); if (process.env.E2E_STACK) console.log(e.stack); });
    await page.goto(url);
    await page.evaluate(() => { try { localStorage.removeItem('wz.effetti'); } catch (e) { /* niente */ } });
    await page.reload(); await page.waitForTimeout(300);
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);

    // 1. Scheda Ricerca: livelli, blocchi, avvio dal pannello, apertura del livello II, livelli che si chiudono.
    {
      const labId = await page.evaluate(() => { __fb.reset(); return __fb.struct('lab'); });
      await tab(page, touch, 'res');
      const heads = await page.evaluate(() => [...document.querySelectorAll('#tabbody [data-act="tier"]')].map(b => ({
        t: +b.dataset.t, name: b.querySelector('.tn').textContent, state: b.querySelector('.ts').textContent, locked: b.classList.contains('locked'), open: b.getAttribute('aria-expanded'),
      })));
      check(heads.length === 4 && heads.map(h => h.name).join(',') === 'Livello I,Livello II,Livello III,Livello IV',
        `${name}: la scheda Ricerca mostra i livelli I–IV (${heads.map(h => h.name).join(', ')})`);
      const h2 = heads.find(h => h.t === 2) || {}, h3 = heads.find(h => h.t === 3) || {};
      check(h2.locked && /^Servono 2 ricerche di livello I \(0\/2\)$/.test(h2.state) && h2.open === 'false' && /Servono 2 ricerche di livello II/.test(h3.state || ''),
        `${name}: un livello bloccato mostra «Servono 2 ricerche di livello …» («${h2.state}», «${h3.state}») ed è chiuso`);
      await press(page, touch, '#tabbody [data-act="research"][data-id="dMG1"]');
      const r1 = await page.evaluate(id => ({ rs: window.__wz.engine.ent(id).rs, st: __fb.txt('#tabbody [data-id="dMG1"] .stl') }), labId);
      check(r1.rs && r1.rs.id === 'dMG1' && /^In corso/.test(r1.st), `${name}: un ${how} su una ricerca di livello I la avvia nel laboratorio (in corso: ${r1.rs ? r1.rs.id : 'nessuna'}, stato «${r1.st}»)`);
      await page.evaluate(id => __fb.finish(id), labId);
      await page.waitForTimeout(300);
      await press(page, touch, '#tabbody [data-act="research"][data-id="mot1"]');
      const done = await page.evaluate(id => __fb.finish(id), labId);
      await page.waitForTimeout(300);
      const h2b = await page.evaluate(() => { const b = document.querySelector('#tabbody [data-act="tier"][data-t="2"]'); return { state: b.querySelector('.ts').textContent, locked: b.classList.contains('locked'), open: b.getAttribute('aria-expanded') }; });
      check(done.includes('dMG1') && done.includes('mot1') && !h2b.locked && h2b.open === 'true' && /^aperto/.test(h2b.state),
        `${name}: dopo due ricerche di livello I il livello II è aperto («${h2b.state}», completate ${done.join(', ')})`);
      const btn = await page.evaluate(() => { const b = document.querySelector('#tabbody [data-act="research"][data-id="wCN"]'); return b ? { dis: b.disabled, st: b.querySelector('.stl').textContent } : null; });
      if (btn && !btn.dis) await press(page, touch, '#tabbody [data-act="research"][data-id="wCN"]');
      const r2 = await page.evaluate(id => window.__wz.engine.ent(id).rs, labId);
      check(btn && !btn.dis && r2 && r2.id === 'wCN', `${name}: una ricerca di livello II (Cannone 40 mm) si avvia dal pannello (stato «${btn && btn.st}», in corso: ${r2 ? r2.id : 'nessuna'})`);
      // Aprire e chiudere un livello con un tocco o un clic sull'intestazione.
      const fold = async t => page.evaluate(t => ({ open: document.querySelector(`#tabbody [data-act="tier"][data-t="${t}"]`).getAttribute('aria-expanded'), items: document.querySelectorAll(`#tabbody [data-act="research"][data-id="${t === 1 ? 'pump2' : 'chX'}"]`).length }), t);
      const a0 = await fold(1);
      await press(page, touch, '#tabbody [data-act="tier"][data-t="1"]'); const a1 = await fold(1);
      await press(page, touch, '#tabbody [data-act="tier"][data-t="1"]'); const a2 = await fold(1);
      const b0 = await fold(4);
      await press(page, touch, '#tabbody [data-act="tier"][data-t="4"]'); const b1 = await fold(4);
      const lockedTxt = await page.evaluate(() => __fb.txt('#tabbody [data-act="research"][data-id="chX"] .stl'));
      check(a0.open === 'true' && a0.items === 1 && a1.open === 'false' && a1.items === 0 && a2.open === 'true' && a2.items === 1,
        `${name}: il livello I si chiude e si riapre con un ${how} (aperto ${a0.open} → ${a1.open} → ${a2.open}, voci ${a0.items} → ${a1.items} → ${a2.items})`);
      check(b0.open === 'false' && b0.items === 0 && b1.open === 'true' && b1.items === 1 && /^Bloccata/.test(lockedTxt || ''),
        `${name}: anche il livello IV bloccato si apre e mostra le ricerche bloccate (Mammut: «${lockedTxt}»)`);
    }

    // 2. Scheda Progetta: parti da ricercare, Mammut + Cingoli rinforzati + Obice, modulo riparazione, produzione.
    {
      await page.evaluate(() => { __fb.reset(); });
      await tab(page, touch, 'des');
      const parts = await page.evaluate(() => {
        const E = window.__wz.engine, out = { badLocked: [], badFree: [], n: 0 };
        for (const [k, table] of [['c', E.CHASSIS], ['p', E.PROPS], ['w', E.WEAPONS]]) for (const [v, D] of Object.entries(table)) {
          const b = document.querySelector(`#tabbody [data-act="dpart"][data-k="${k}"][data-v="${v}"]`); out.n++;
          if (!b) { out.badLocked.push(`${k}:${v} assente`); continue; }
          const small = b.querySelector('small').textContent;
          if (D.tier > 1 && !(b.disabled && /da ricercare/.test(small))) out.badLocked.push(`${v} («${small}», ${b.disabled ? 'spento' : 'attivo'})`);
          if (D.tier === 1 && (b.disabled || /da ricercare/.test(small))) out.badFree.push(v);
        }
        return out;
      });
      check(parts.n === 21 && !parts.badLocked.length && !parts.badFree.length,
        `${name}: in Progetta le ${parts.n} parti oltre il livello I sono spente con «da ricercare», quelle di livello I sono attive${parts.badLocked.length || parts.badFree.length ? ` (sbagliate: ${[...parts.badLocked, ...parts.badFree].join(', ')})` : ''}`);
      const fid = await page.evaluate(() => { const E = window.__wz.engine; for (const t of E.TECH) E.S.tech[0][t.id] = true; return __fb.struct('factory'); });
      await page.waitForTimeout(300);
      for (const [k, v] of [['c', 'X'], ['p', 'TR'], ['w', 'HW']]) await press(page, touch, `#tabbody [data-act="dpart"][data-k="${k}"][data-v="${v}"]`);
      const d1 = await page.evaluate(() => ({ draft: window.__wz.ui.draft, pn: __fb.txt('#tabbody .pn'), kv: __fb.txt('#tabbody .kv'), save: __fb.txt('#tabbody [data-act="dsave"]') }));
      check(d1.draft.c === 'X' && d1.draft.p === 'TR' && d1.draft.w === 'HW' && d1.pn === 'Mammut Obice Cing. rinf.' && /Gittata ?3,5–13/.test(d1.kv) && /Danno\/s/.test(d1.kv) && d1.save === 'Salva il progetto',
        `${name}: con le ricerche fatte si compone Mammut + Cingoli rinforzati + Obice («${d1.pn}», ${d1.kv})`);
      await press(page, touch, '#tabbody [data-act="dsave"]');
      const s1 = await page.evaluate(() => ({ designs: window.__wz.engine.S.designs.map(d => d.c + d.p + d.w), save: __fb.txt('#tabbody [data-act="dsave"]') }));
      check(s1.designs.includes('XTRHW') && s1.save === 'Progetto già salvato', `${name}: il progetto Mammut Obice si salva (progetti ${s1.designs.join(', ')}, pulsante «${s1.save}»)`);
      for (const [k, v] of [['c', 'M'], ['p', 'HT'], ['w', 'RP']]) await press(page, touch, `#tabbody [data-act="dpart"][data-k="${k}"][data-v="${v}"]`);
      const d2 = await page.evaluate(() => ({ pn: __fb.txt('#tabbody .pn'), kv: __fb.txt('#tabbody .kv'), part: __fb.txt('#tabbody [data-act="dpart"][data-v="RP"] small') }));
      check(/Ripara ?15\/s/.test(d2.kv) && !/Danno|Gittata/.test(d2.kv) && /ripara 15\/s/.test(d2.part),
        `${name}: un progetto con il modulo riparazione mostra «Ripara» e non danno né gittata («${d2.pn}»: ${d2.kv})`);
      await press(page, touch, '#tabbody [data-act="dsave"]');
      // La fabbrica produce i due progetti: si scelgono dalla scheda Produzione.
      await tab(page, touch, 'prod');
      const idx = await page.evaluate(() => { const ds = window.__wz.engine.S.designs; return { hw: ds.findIndex(d => d.w === 'HW'), rp: ds.findIndex(d => d.w === 'RP'), n: ds.length }; });
      const chip = await page.evaluate(fid => { const b = document.querySelector('#tabbody .chip.on'); return b ? +b.dataset.id === fid : false; }, fid);
      if (!chip) await press(page, touch, `#tabbody [data-act="producer"][data-id="${fid}"]`);
      await press(page, touch, `#tabbody [data-act="prod"][data-i="${idx.hw}"]`);
      await press(page, touch, `#tabbody [data-act="prod"][data-i="${idx.rp}"]`);
      const q = await page.evaluate(fid => window.__wz.engine.ent(fid).queue.map(x => x.d.c + x.d.p + x.d.w), fid);
      const made = await page.evaluate(() => {
        const W = window.__wz, E = W.engine, before = new Set(E.S.ents.map(e => e.id));
        for (let i = 0; i < 20 * 90; i++) E.step(0.05);
        return E.S.ents.filter(e => !before.has(e.id) && e.kind === 'unit' && e.owner === 0 && !e.dead && e.d).map(e => ({ id: e.id, k: e.d.c + e.d.p + e.d.w, hp: e.hp, max: e.max }));
      });
      const hw = made.find(m => m.k === 'XTRHW'), rp = made.find(m => m.k === 'MHTRP');
      check(q.join(',') === 'XTRHW,MHTRP' && hw && rp && hw.max === 1440,
        `${name}: la fabbrica mette in coda e produce Mammut Obice e Lince Ripara (coda ${q.join(', ')}; prodotti ${made.map(m => m.k).join(', ') || 'nessuno'}${hw ? `, Mammut ${hw.max} PS` : ''})`);
      if (rp && hw) {
        await page.evaluate(id => { window.__wz.ui.sel = [id]; window.__wz.ui.key = ''; }, rp.id); await page.waitForTimeout(400);
        const selRp = await page.evaluate(() => __fb.txt('#sel'));
        await page.evaluate(id => { window.__wz.ui.sel = [id]; window.__wz.ui.key = ''; }, hw.id); await page.waitForTimeout(400);
        const selHw = await page.evaluate(() => __fb.txt('#sel'));
        check(/Ripara ?15\/s/.test(selRp) && !/Danno|Gittata/.test(selRp) && /Arma ?Obice/.test(selHw) && /Gittata ?3,5–13/.test(selHw),
          `${name}: selezionati, il mezzo di riparazione mostra «Ripara» e l’obice la gittata 3,5–13 («${selRp}» · «${selHw}»)`);
      }
    }

    // 3. Scheda Costruisci: bunker bloccato senza stBK, piazzabile con un clic sulla mappa con stBK.
    {
      const s = await page.evaluate(() => { __fb.reset(); const b = __fb.builder(); window.__wz.ui.sel = [b.id]; return { bid: b.id }; });
      await tab(page, touch, 'build');
      const lk = await page.evaluate(() => { const b = document.querySelector('#tabbody [data-act="place"][data-type="bunker"]'); return b ? { dis: b.disabled, ds: b.querySelector('.ds').textContent } : null; });
      check(lk && lk.dis && /Richiede la ricerca Bunker pesante \(livello III\)/.test(lk.ds), `${name}: senza la ricerca il bunker è spento («${lk && lk.ds}»)`);
      const p = await page.evaluate(() => {
        const W = window.__wz, E = W.engine, T = E.TILE;
        E.S.tech[0].stBK = true;
        const sp = __fb.spot('bunker', E.B0.x + 4, E.B0.y + 4);
        __fb.center((sp[0] + 1) * T, (sp[1] + 1) * T);
        return { tx: sp[0], ty: sp[1], wx: (sp[0] + 1) * T, wy: (sp[1] + 1) * T };
      });
      await page.waitForTimeout(300);
      const en = await page.evaluate(() => { const b = document.querySelector('#tabbody [data-act="place"][data-type="bunker"]'); return { dis: b.disabled, ds: b.querySelector('.ds').textContent }; });
      if (!en.dis) await press(page, touch, '#tabbody [data-act="place"][data-type="bunker"]');
      const placing = await page.evaluate(() => window.__wz.ui.placing);
      // Su telefono (disposizione B, piano 05) il tocco porta lì l'edificio ma non lo costruisce: serve ✓.
      const lb = await page.evaluate(() => document.documentElement.classList.contains('lb'));
      if (lb) await page.waitForTimeout(300); // il cassetto si chiude scorrendo
      const at = await page.evaluate(([x, y]) => __fb.scr(x, y), [p.wx, p.wy]);
      if (at.onMap) { if (touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y); await page.waitForTimeout(100); }
      let wait = null;
      if (lb) {
        wait = await page.evaluate(() => ({ n: window.__wz.engine.S.ents.filter(e => e.type === 'bunker' && !e.dead).length, placing: window.__wz.ui.placing, bar: !document.getElementById('placebar').hidden }));
        await press(page, touch, '#btnPlaceOk');
      }
      const r = await page.evaluate(([bid, tx, ty]) => {
        const E = window.__wz.engine, bk = E.S.ents.find(e => e.type === 'bunker' && e.owner === 0 && !e.dead);
        return { bk: bk ? { tx: bk.tx, ty: bk.ty, id: bk.id } : null, order: E.ent(bid).order, placing: window.__wz.ui.placing };
      }, [s.bid, p.tx, p.ty]);
      if (lb) check(wait.n === 0 && wait.placing === 'bunker' && wait.bar, `${name}: su telefono il ${how} sulla mappa sposta il bunker ma non lo costruisce prima di ✓ (bunker ${wait.n}, conferma ${wait.bar ? 'visibile' : 'nascosta'})`);
      check(!en.dis && placing === 'bunker' && at.onMap && r.bk && r.bk.tx === p.tx && r.bk.ty === p.ty && r.order.t === 'build' && r.order.id === r.bk.id,
        `${name}: con la ricerca il bunker si sceglie e si piazza con un ${how} sulla mappa${lb ? ' e ✓' : ''} (pulsante ${en.dis ? 'spento' : 'attivo'}, bunker ${r.bk ? `in ${r.bk.tx},${r.bk.ty}` : 'assente'}, geniere: ${r.order.t}${at.onMap ? '' : ', punto coperto da ' + at.under})`);
    }

    // 4. Battaglia con tutte le armi nuove e un bunker: niente errori, niente numeri non validi, screenshot.
    {
      const setup = await page.evaluate(ws => {
        const W = window.__wz, E = W.engine, T = E.TILE;
        __fb.fresh(4242);
        Object.assign(W.ui, { sel: [], placing: null, amove: false, mode: 'select', key: '' });
        for (const s of [0, 1]) for (const t of E.TECH) E.S.tech[s][t.id] = true;
        for (let y = 18; y < 46; y++) for (let x = 16; x < 48; x++) E.explored[x + y * E.MW] = 1;
        const cs = ['L', 'M', 'H', 'X'], ps = ['W', 'HT', 'T', 'V', 'TR'];
        let n = 0;
        for (let i = 0; i < ws.length * 2; i++) {
          const w = ws[i % ws.length], row = i % 12, back = Math.floor(i / 12);
          // fiamma e riparazione in prima linea, artiglieria dietro
          const col = w === 'FL' || w === 'RP' ? 0 : w === 'HW' || w === 'MO' || w === 'MRL' ? 3 : 1 + back;
          for (const side of [0, 1]) {
            const f = E.nearestFree(side ? 34 + col : 30 - col, 26 + row, false);
            const u = E.makeUnit(side, { c: cs[(i + side) % 4], p: ps[(i + side) % 5], w }, (f[0] + 0.5) * T, (f[1] + 0.5) * T);
            if (w !== 'RP') u.hp = u.max * 0.6; // danneggiati: i moduli riparazione hanno da fare
            n++;
          }
        }
        const sp = (() => { for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (E.canPlace(0, 'bunker', 27 + dx, 31 + dy)) return [27 + dx, 31 + dy]; return null; })();
        if (sp) E.makeStruct('bunker', 0, sp[0], sp[1], true);
        E.updateFog();
        const cv = document.getElementById('view');
        W.cam.x = 32 * T - cv.clientWidth / W.cam.z / 2; W.cam.y = 31.5 * T - cv.clientHeight / W.cam.z / 2;
        // armi che hanno sparato (lampo alla bocca), fiamme e raggi di riparazione
        const fired = {}; window.__fbFired = fired;
        window.__fbOff && window.__fbOff();
        window.__fbOff = E.onEvent((t, d) => { if (t !== 'fx') return; const k = d.k === 'flash' ? d.w : d.k === 'flame' ? 'fiamma' : d.k === 'repair' ? 'riparazione' : null; if (k) fired[k] = (fired[k] || 0) + 1; });
        W.ui.paused = false;
        return { n, bunker: !!sp };
      }, ALL_W);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: path.join(outDir, `${name}-battaglia-faseb.png`) });
      const r = await page.evaluate(() => {
        const W = window.__wz, E = W.engine;
        const mid = __fb.badNumbers();
        W.ui.paused = true;
        for (let i = 0; i < 20 * 25; i++) E.step(0.05);
        window.__fbOff(); window.__fbOff = null;
        const alive = E.S.ents.filter(e => e.kind === 'unit' && !e.dead && e.d).length;
        return { mid, end: __fb.badNumbers(), fired: window.__fbFired, alive, parts: W.fxs.parts.length };
      });
      await page.waitForTimeout(200);
      const missing = [...NEW_W.filter(w => w !== 'RP'), 'fiamma', 'riparazione'].filter(k => !r.fired[k]);
      check(setup.bunker && !missing.length && r.fired.RP == null,
        `${name}: in battaglia sparano tutte le armi nuove, la fiamma brucia e il modulo riparazione ripara (${Object.entries(r.fired).map(([k, v]) => `${k} ${v}`).join(', ')}${missing.length ? '; mancano ' + missing.join(', ') : ''})`);
      check(!r.mid.length && !r.end.length, `${name}: nessun valore non numerico nello stato durante e dopo la battaglia (${setup.n} mezzi, ${r.alive} vivi dopo 25 s)${r.mid.length || r.end.length ? ': ' + [...r.mid, ...r.end].join(', ') : ''}`);
      check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove della fase B${errors.length ? ': ' + errors.join(' | ') : ''}`);
    }

    // 5. Qualità adattiva: la scelta «Effetti» cambia il livello, resta dopo il ricaricamento, «Bassi» rispetta il tetto.
    {
      await openMenu(page); // su telefono «Comandi» sta nel cassetto «Menu»
      await press(page, touch, '#btnHelp');
      await press(page, touch, '#overlay [data-fx="bassa"]');
      const q1 = await page.evaluate(() => ({ q: window.__wz.fxq(), on: document.querySelector('#overlay [data-fx="bassa"]').getAttribute('aria-pressed'), ls: localStorage.getItem('wz.effetti') }));
      await press(page, touch, '#overlay [data-fx="alta"]');
      const q2 = await page.evaluate(() => window.__wz.fxq());
      await press(page, touch, '#overlay [data-fx="auto"]');
      const q3 = await page.evaluate(() => ({ q: window.__wz.fxq(), out: document.getElementById('ovFxV').textContent }));
      await press(page, touch, '#overlay [data-fx="bassa"]');
      await press(page, touch, '#ovClose');
      check(q1.q.pref === 'bassa' && q1.q.level === 'bassa' && q1.on === 'true' && q1.ls === 'bassa' && q2.level === 'alta' && q3.q.pref === 'auto' && /^ora (alta|media|bassa)$/.test(q3.out),
        `${name}: «Effetti» cambia il livello (Bassi → ${q1.q.level}, Alti → ${q2.level}, Automatici → ${q3.q.level} «${q3.out}»)`);
      await page.reload(); await page.waitForTimeout(300);
      const q4 = await page.evaluate(() => window.__wz.fxq());
      await page.locator('#ovStart').click();
      await page.evaluate(installHelpers);
      await openMenu(page);
      await press(page, touch, '#btnHelp');
      const q4b = await page.evaluate(() => document.querySelector('#overlay [data-fx="bassa"]').getAttribute('aria-pressed'));
      await press(page, touch, '#ovClose');
      check(q4.pref === 'bassa' && q4.level === 'bassa' && q4b === 'true', `${name}: la scelta «Bassi» resta dopo il ricaricamento (livello ${q4.level}, pulsante premuto ${q4b})`);
      // Molte esplosioni e una battaglia al centro della visuale: si misura il numero di particelle a ogni fotogramma.
      const stress = () => page.evaluate(() => new Promise(res => {
        const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
        __fb.fresh(4242);
        Object.assign(W.ui, { sel: [], placing: null, amove: false, key: '', paused: false });
        W.fxs.parts.length = 0;
        for (let y = 18; y < 46; y++) for (let x = 16; x < 48; x++) E.explored[x + y * E.MW] = 1;
        const ws = ['MRL', 'HW', 'FL', 'AT', 'CN105', 'RK'];
        for (let i = 0; i < 60; i++) { const s = i % 2, k = i >> 1, f = E.nearestFree(s ? 35 + (k % 3) : 29 - (k % 3), 26 + (k % 10), false); E.makeUnit(s, { c: 'H', p: 'T', w: ws[k % 6] }, (f[0] + 0.5) * T, (f[1] + 0.5) * T); }
        E.updateFog();
        W.cam.x = 32 * T - cv.clientWidth / W.cam.z / 2; W.cam.y = 31 * T - cv.clientHeight / W.cam.z / 2;
        let max = 0, n = 0; const t0 = performance.now();
        const f = now => {
          if (n++ % 3 === 0) for (let j = 0; j < 4; j++) E.explodeAt((28 + Math.random() * 8) * T, (27 + Math.random() * 8) * T, 1.6, 1, 0, 2);
          max = Math.max(max, W.fxs.parts.length);
          if (now - t0 < 2500) requestAnimationFrame(f); else { W.ui.paused = true; res({ max, frames: n, q: W.fxq() }); }
        };
        requestAnimationFrame(f);
      }));
      const low = await stress();
      check(low.q.level === 'bassa' && low.max > 0 && low.max <= 150, `${name}: con «Bassi» le particelle non superano il tetto di 150 (massimo ${low.max} in ${low.frames} fotogrammi)`);
      await page.evaluate(() => window.__wz.setFx('alta'));
      const high = await stress();
      check(high.q.level === 'alta' && high.max > 150, `${name}: controprova: con «Alti» la stessa scena supera 150 particelle (massimo ${high.max}, tetto 700)`);
      await page.evaluate(() => { window.__wz.setFx('auto'); localStorage.removeItem('wz.effetti'); });
      check(errors.length === 0, `${name}: nessun errore JavaScript con la qualità degli effetti${errors.length ? ': ' + errors.join(' | ') : ''}`);
    }
    // 6. Problema noto: segnali della minimappa rimasti da una partita precedente con un tempo più lungo.
    //    E.newGame (o loadState) senza startGame lascia fxs.pings; il disegno della minimappa calcola un raggio
    //    negativo, arc() lancia un errore e il ciclo dei fotogrammi si ferma.
    {
      const before = errors.length;
      const r = await page.evaluate(() => new Promise(res => {
        const W = window.__wz, E = W.engine;
        E.S.time = 60; W.fxs.pings.push({ x: 300, y: 300, t: 60 }); // un segnale a 60 s nella partita in corso
        E.newGame('normale', 777); // nuova partita senza passare dalla copertina: il tempo torna a 0
        Object.assign(W.ui, { paused: false, overlay: null });
        const t0 = E.S.time;
        setTimeout(() => { const t1 = E.S.time; W.ui.paused = true; res({ adv: +(t1 - t0).toFixed(2), pings: W.fxs.pings.length }); }, 1200);
      }));
      const errs = errors.slice(before);
      todo(!errs.length && r.adv > 0.5, `${name}: dopo E.newGame con un segnale della minimappa rimasto, il gioco continua (tempo avanzato ${r.adv} s in 1,2 s, segnali ${r.pings}${errs.length ? ', errore: ' + errs[0] : ''})`);
      errors.length = before;
    }
    await page.close();
  }
}

// Lancio da solo: node tests/e2e/faseb.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const todo = (ok, msg) => console.log(`${ok ? 'ok  ' : 'TODO'} ${msg}`);
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runPhaseBChecks({ browser, url, check, todo, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della fase B sono passati.');
}
