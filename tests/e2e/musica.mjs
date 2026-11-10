// Prove della colonna sonora adattiva (piano 03) nel browser: partenza al primo gesto, tema del menu, passaggio
// calma → battaglia → calma guidato dagli scontri visibili, scontri nella nebbia ignorati, «Musica» e volume salvati,
// silenzio con «Suono» spento, primo accordo con il thread occupato, «Valle liberata» che finita non riparte,
// nessun errore.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/musica.mjs
// Lo stato si legge con window.__wz.music(); l'uscita audio reale con un analizzatore agganciato alla destinazione
// del contesto audio (init script che intercetta AudioNode.connect).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { openMenu } from './layoutb.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');

// Prima che la pagina si carichi: ogni nodo collegato alla destinazione si collega anche a un analizzatore.
function tapAudio() {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (d, ...rest) {
    if (typeof AudioDestinationNode !== 'undefined' && d instanceof AudioDestinationNode) {
      const c = this.context;
      if (!c.__an) { c.__an = c.createAnalyser(); c.__an.fftSize = 2048; window.__an = c.__an; }
      orig.call(this, c.__an);
    }
    return orig.call(this, d, ...rest);
  };
  // Livello efficace dell'uscita negli ultimi ~40 ms (−1 se il contesto audio non esiste ancora).
  window.__rms = () => {
    const a = window.__an; if (!a) return -1;
    const buf = new Float32Array(a.fftSize); a.getFloatTimeDomainData(buf);
    let s = 0; for (const v of buf) s += v * v; return Math.sqrt(s / buf.length);
  };
}

// Strumenti dentro la pagina: nuova partita in pausa con la camera su (cx, cy) e scontri pronti.
function installHelpers() {
  const W = window.__wz, E = W.engine, T = E.TILE, cv = document.getElementById('view');
  const free = (tx, ty) => { const f = E.nearestFree(tx, ty, false); return { tx: f[0], ty: f[1], x: (f[0] + 0.5) * T, y: (f[1] + 0.5) * T }; };
  window.__m = {
    reset(seed, cx = 32, cy = 32) {
      E.newGame('normale', seed);
      Object.assign(W.ui, { sel: [], placing: null, amove: false, paused: true, key: '' });
      W.cam.z = 1;
      const c = free(cx, cy);
      W.cam.x = c.x - cv.clientWidth / 2; W.cam.y = c.y - cv.clientHeight / 2;
      E.updateFog();
      return c;
    },
    // Scontro visibile al centro della visuale: 8 mezzi per parte, uno di fronte all'altro.
    battle(c) {
      for (let i = 0; i < 8; i++) {
        const a = free(c.tx - 2, c.ty - 4 + i), b = free(c.tx + 3, c.ty - 4 + i);
        E.makeUnit(0, { c: 'L', p: 'W', w: 'MG' }, a.x, a.y);
        E.makeUnit(1, { c: 'M', p: 'HT', w: 'CN' }, b.x, b.y);
      }
      E.updateFog();
    },
    // Tutti i mezzi tolti in silenzio (senza esplosioni), così da qui in poi non ci sono più scontri.
    quiet() { for (const e of E.S.ents) if (e.kind === 'unit') e.dead = true; },
    // Spari ed esplosioni del nemico in (x, y): gli stessi eventi «fx» del motore, a raffica per secs secondi.
    async volley(x, y, secs) {
      const t0 = performance.now();
      while (performance.now() - t0 < secs * 1000) {
        for (let k = 0; k < 4; k++) E.emit('fx', { k: 'flash', x: x + k * 8, y, owner: 1, w: 'CN', s: 5 });
        E.emit('fx', { k: 'boom', x, y, owner: 1, kind: 'unit', size: 0.9 });
        E.emit('fx', { k: 'boom', x: x + 20, y, owner: 1, size: 1.6 });
        await new Promise(r => setTimeout(r, 100));
      }
    },
    visible(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); return E.vis[tx + ty * E.MW] === 1; },
    onScreen(x, y) { return x > W.cam.x && x < W.cam.x + cv.clientWidth / W.cam.z && y > W.cam.y && y < W.cam.y + cv.clientHeight / W.cam.z; },
    st: () => ({ ...W.music(), rms: window.__rms() }),
  };
}

// Attende che cond(stato della musica) sia vera, controllando ogni 100 ms; restituisce i secondi trascorsi o -1.
async function waitMusic(page, cond, maxS) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    const m = await page.evaluate(() => window.__wz.music());
    if (cond(m)) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(100);
  }
  return -1;
}
// Come waitMusic, ma con una condizione qualsiasi valutata nella pagina.
async function waitFor(page, fn, maxS) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxS * 1000) {
    if (await page.evaluate(fn)) return (Date.now() - t0) / 1000;
    await page.waitForTimeout(100);
  }
  return -1;
}
const gesture = async (page, touch, sel) => {
  const b = await page.locator(sel).boundingBox();
  if (touch) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const sec = v => v.toFixed(1).replace('.', ',');

// Primo gesto con il thread principale occupato per busyMs subito dopo (macchina carica, telefono lento): istanti
// delle prime note della musica rispetto all'inizio della sezione del menu.
export async function firstNotesUnderLoad(browser, opts, url, busyMs) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(ms => {
    window.__starts = [];
    const st = AudioScheduledSourceNode.prototype.start, so = OscillatorNode.prototype.start;
    const rec = f => function (w, ...r) { if (w !== undefined && window.__starts.length < 200) window.__starts.push(w); return f.call(this, w, ...r); };
    AudioScheduledSourceNode.prototype.start = rec(st); if (Object.prototype.hasOwnProperty.call(OscillatorNode.prototype, 'start')) OscillatorNode.prototype.start = rec(so);
    // dopo i gestori del gioco (che creano il contesto audio e avviano la musica): lavoro pesante sul thread principale
    window.addEventListener('pointerdown', () => { const t = performance.now(); while (performance.now() - t < ms); }, { once: true });
  }, busyMs);
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => { for (const k of ['wz.musica', 'wz.musica.volume', 'wz.sound', 'wz.volume']) try { localStorage.removeItem(k); } catch (e) { /* niente */ } });
  await page.reload();
  await page.waitForTimeout(500);
  await gesture(page, false, '#ovt');
  const t = await waitFor(page, () => window.__wz.music().played > 0, 4);
  const first = await page.evaluate(() => Math.min(...window.__starts));
  await ctx.close();
  return { t, first };
}

// «Valle liberata» con l'orologio audio fatto avanzare a mano: il modulo client/music.js (non il gioco costruito)
// collegato a un OfflineAudioContext il cui currentTime lo decide la prova; il timer della musica gira davvero (50 ms).
// Si comporta come main.js: la richiesta 'finale' ripetuta a ogni passo (ogni 0,2 s nel gioco).
async function finaleOnce() {
  const W = window.WZM; let T = 0;
  const off = new OfflineAudioContext(2, 22050, 22050);
  const fake = new Proxy(off, { get(t, k) { if (k === 'currentTime') return T; if (k === 'state') return 'running'; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const st = () => { const m = W.musicState(); return { want: m.want, mode: m.mode, profile: m.profile, key: m.key, bpm: m.bpm, played: m.played }; };
  const step = async t => { T = t; W.musicMode('finale'); await wait(70); return st(); };
  W.setMusic(true); W.attachMusic(fake, off.destination); W.musicMode('finale');
  const r = { start: await step(0.1), tMenu: -1, finale: null, after: [] };
  // fino a 120 s a passi di 1 s: quando torna il menu, e che cosa si chiede in quel momento
  for (let t = 1; t <= 120 && r.tMenu < 0; t++) {
    const s = await step(t);
    if (s.mode === 'finale') r.finale = s;
    if (s.mode === 'menu') { r.tMenu = t; r.atEnd = s; }
  }
  // dopo la fine: 12 s di richieste 'finale' ripetute ogni 0,2 s (tempo virtuale) non la fanno ripartire
  if (r.tMenu > 0) {
    const t0 = r.tMenu, modes = new Set(), wants = new Set();
    for (let t = t0 + 0.2; t < t0 + 12; t = +(t + 0.2).toFixed(2)) { const s = await step(t); modes.add(s.mode); wants.add(s.want); }
    r.repeated = { modes: [...modes], wants: [...wants], played: st().played };
    // musica spenta e riaccesa (richiesta 'finale' sempre in corso): resta il menu
    W.setMusic(false); const off1 = st();
    W.setMusic(true); const back = await step(t0 + 31); const back2 = await step(t0 + 33);
    r.toggle = { off: off1, back, back2 };
    // un altro momento (il menu) e poi una nuova richiesta 'finale': riparte da capo
    T = t0 + 34; W.musicMode('menu'); await wait(70);
    const again = await step(t0 + 35), again2 = await step(t0 + 40);
    r.again = { again, again2 };
  }
  return r;
}

async function checkFinaleOnce(browser, check) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const { build } = createRequire(import.meta.url)('esbuild');
  const js = (await build({ entryPoints: [path.join(root, 'client/music.js')], bundle: true, format: 'iife', globalName: 'WZM', write: false, target: 'es2020' })).outputFiles[0].text;
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<!doctype html><title>Valle liberata</title>');
  await page.addScriptTag({ content: js });
  const t0 = Date.now();
  const r = await page.evaluate(finaleOnce);
  await page.close();
  const f = r.finale;
  check(r.start.mode === 'finale' && r.start.want === 'finale' && f && f.profile === 'valle-liberata' && f.key === 're maggiore' && f.bpm === 80,
    `«Valle liberata» (orologio audio a mano): chiesta, parte (modo ${r.start.mode}, profilo ${f ? f.profile : '—'}, ${f ? `${f.key}, ${f.bpm} battiti` : '—'})`);
  check(r.tMenu >= 84 && r.tMenu <= 93 && r.atEnd.want === 'menu' && r.atEnd.mode === 'menu' && r.atEnd.profile === null,
    `«Valle liberata» finisce da sola dopo ${r.tMenu < 0 ? 'più di 120' : r.tMenu} s e musicState().want diventa «${r.atEnd ? r.atEnd.want : '—'}» (modo ${r.atEnd ? r.atEnd.mode : '—'}; attesi 84–93 s e «menu»)`);
  if (r.tMenu < 0) return;
  const rp = r.repeated, tg = r.toggle, ag = r.again;
  check(rp.modes.length === 1 && rp.modes[0] === 'menu' && rp.wants.length === 1 && rp.wants[0] === 'menu',
    `«Valle liberata» finita: 12 s di richieste «finale» ripetute ogni 0,2 s non la fanno ripartire (modi ${JSON.stringify(rp.modes)}, want ${JSON.stringify(rp.wants)})`);
  check(tg.off.mode === 'off' && [tg.back, tg.back2].every(s => s.mode === 'menu' && s.want === 'menu' && s.profile === null),
    `«Valle liberata» finita: spenta e riaccesa la musica resta il tema del menu (spenta ${tg.off.mode}, riaccesa ${tg.back.mode}/${tg.back2.mode}, profilo ${tg.back2.profile})`);
  check([ag.again, ag.again2].every(s => s.mode === 'finale' && s.want === 'finale' && s.profile === 'valle-liberata') && ag.again2.played > ag.again.played,
    `«Valle liberata»: una nuova richiesta «finale» dopo un altro momento la fa ripartire (modo ${ag.again.mode}/${ag.again2.mode}, profilo ${ag.again2.profile}, note ${ag.again.played} → ${ag.again2.played})`);
  check(!errors.length, `«Valle liberata» con l'orologio a mano: nessun errore (${sec((Date.now() - t0) / 1000)} s)${errors.length ? ': ' + errors.join(' | ') : ''}`);
}

export async function runMusicChecks({ browser, url, check, profiles }) {
  // Primo gesto con il thread principale occupato (macchina carica, telefono lento): il tema del menu deve partire
  // dal primo accordo, con la prima nota a circa 0,2 s del contesto audio, non saltarlo e ripartire mezzo giro dopo.
  if (profiles.some(([n]) => n === 'desktop')) {
    const r = await firstNotesUnderLoad(browser, { viewport: { width: 1280, height: 800 } }, url, 120);
    check(r.t >= 0 && r.t <= 0.8 && Number.isFinite(r.first) && r.first < 0.45,
      `desktop: con il thread principale occupato 120 ms dopo il primo gesto il tema del menu parte dal primo accordo (prima nota pianificata a ${Number.isFinite(r.first) ? r.first.toFixed(2).replace('.', ',') : '—'} s del contesto audio, note dopo ${r.t < 0 ? 'più di 4' : sec(r.t)} s; attesa circa 0,2 s e comunque sotto 0,45 s, note entro 0,8 s; col difetto era a 1,8 s)`);
  }
  await checkFinaleOnce(browser, check);
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const ctx = await browser.newContext(opts);
    await ctx.addInitScript(tapAudio);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.evaluate(() => { for (const k of ['wz.musica', 'wz.musica.volume', 'wz.sound', 'wz.volume']) try { localStorage.removeItem(k); } catch (e) { /* niente */ } });
    await page.reload();
    await page.waitForTimeout(600);

    // 1. Prima di un gesto non parte nulla; dopo un gesto nel menu suona il tema del menu.
    const m0 = await page.evaluate(() => window.__wz.music());
    check(m0.ctx === 'none' && !m0.timer && !m0.played, `${name}: la musica non parte prima di un gesto (contesto ${m0.ctx}, note ${m0.played || 0})`);
    await gesture(page, touch, '#ovt');   // un tocco sul titolo: è un gesto, ma si resta nel menu
    // Attesa per condizione (non un tempo fisso): qui conta che il tema parta e si senta; la partenza dal primo
    // accordo anche con il thread occupato si prova a parte (firstNotesUnderLoad).
    const tM1 = await waitFor(page, () => {
      const m = window.__wz.music();
      return window.__wz.ui.overlay === 'start' && m.ctx === 'running' && m.timer && m.mode === 'menu' && m.played > 0 && window.__rms() > 0.002;
    }, 5);
    const m1 = await page.evaluate(() => ({ ...window.__wz.music(), ov: window.__wz.ui.overlay, rms: window.__rms() }));
    check(tM1 >= 0 && m1.ov === 'start' && m1.ctx === 'running' && m1.timer && m1.mode === 'menu' && m1.played > 0,
      `${name}: dopo il primo gesto nel menu suona il tema del menu (si sente dopo ${tM1 < 0 ? 'più di 5' : sec(tM1)} s; modo ${m1.mode}, note ${m1.played}, livello d’uscita ${m1.rms.toFixed(3)})`);

    // 2. In partita: calma; uno scontro visibile porta la battaglia in pochi secondi e la tiene finché dura.
    await page.locator('#ovStart').click();
    await page.evaluate(installHelpers);
    await page.waitForTimeout(800);
    const m2 = await page.evaluate(() => { window.__m.reset(4242); return window.__wz.music(); });
    await page.waitForTimeout(600);
    const m2b = await page.evaluate(() => window.__wz.music());
    check(m2.mode === 'game' && m2b.state === 'calm', `${name}: in partita, senza scontri, la musica è calma (modo ${m2.mode}, stato ${m2b.state})`);
    await page.evaluate(() => { const m = window.__m, c = m.reset(4242); m.battle(c); window.__wz.ui.paused = false; });
    const tBattle = await waitMusic(page, m => m.state === 'battle', 6);
    await page.waitForTimeout(2500);
    const m3 = await page.evaluate(() => window.__wz.music());
    check(tBattle >= 0 && tBattle <= 4 && m3.state === 'battle',
      `${name}: uno scontro visibile porta la musica in battaglia (dopo ${tBattle < 0 ? 'più di 6' : sec(tBattle)} s) e ci resta mentre si combatte (stato ${m3.state}, intensità ${m3.intensity})`);

    // 3. Fine degli scontri (partita in pausa e mezzi tolti): niente calma subito, calma dopo circa 10 s.
    await page.evaluate(() => { window.__wz.ui.paused = true; window.__m.quiet(); });
    const t0 = Date.now();
    await page.waitForTimeout(4000);
    const m4 = await page.evaluate(() => window.__wz.music());
    const tCalm = await waitMusic(page, m => m.state === 'calm', 14);
    const after = tCalm < 0 ? -1 : (Date.now() - t0) / 1000;
    check(m4.state !== 'calm' && after >= 5 && after <= 16,
      `${name}: senza più scontri la musica torna alla calma dopo ${after < 0 ? 'più di 18' : sec(after)} s (dopo 4 s era ancora «${m4.state}»; atteso tra 5 e 16 s)`);

    // 4. Uno scontro fuori visuale e nella nebbia (spari ed esplosioni del nemico) non porta né tensione né battaglia;
    //    gli stessi eventi sullo schermo sì (controllo che la prova non sia vuota).
    const fog = await page.evaluate(async () => {
      const m = window.__m, W = window.__wz, c = m.reset(4242, 12, 12);
      const x = 52 * 32, y = 50 * 32;
      const out = { visible: m.visible(x, y), onScreen: m.onScreen(x, y) };
      const seen = new Set();
      const t0 = performance.now();
      const watch = setInterval(() => seen.add(W.music().state), 100);
      await m.volley(x, y, 4);
      await new Promise(r => setTimeout(r, 600));
      clearInterval(watch);
      return { ...out, seen: [...seen], intensity: W.music().intensity, ms: Math.round(performance.now() - t0), c };
    });
    check(!fog.visible && !fog.onScreen && fog.seen.length === 1 && fog.seen[0] === 'calm' && fog.intensity < 0.05,
      `${name}: uno scontro nemico fuori visuale e nella nebbia lascia la musica calma (stati ${JSON.stringify(fog.seen)}, intensità ${fog.intensity})`);
    const ctl = await page.evaluate(async c => {
      const m = window.__m, W = window.__wz, E = W.engine;
      // stessa raffica, ma dove il giocatore vede: accanto a un suo mezzo al centro della visuale
      const u = E.S.ents.find(e => e.kind === 'unit' && e.owner === 0 && !e.dead);
      u.x = c.x; u.y = c.y; E.updateFog();
      await m.volley(c.x + 64, c.y, 3);
      return { visible: m.visible(c.x + 64, c.y), state: W.music().state };
    }, fog.c);
    check(ctl.visible && ctl.state === 'battle', `${name}: la stessa raffica in vista porta la battaglia (stato ${ctl.state})`);
    await page.evaluate(() => { window.__m.reset(4242); });

    // 5. Vittoria e sconfitta hanno la loro frase: a partita persa il modo passa a «lose» e suonano note nuove.
    {
      const p0 = await page.evaluate(() => window.__wz.music().played);
      await page.evaluate(() => {
        const W = window.__wz, E = W.engine;
        for (const e of E.S.ents) if (e.owner === 0 && !e.dead) E.kill(e, 1);
        for (let i = 0; i < 20 && E.S.phase === 'play'; i++) W.step(0.05);
      });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ ...window.__wz.music(), phase: window.__wz.S.phase, ov: window.__wz.ui.overlay }));
      check(r.phase === 'lost' && r.mode === 'lose' && r.played > p0, `${name}: a partita persa suona la frase della sconfitta (fase ${r.phase}, modo ${r.mode}, note ${p0} → ${r.played})`);
    }

    // 6. «Musica» e volume in «Comandi»: si salvano sul dispositivo e restano dopo il ricaricamento.
    {
      await page.locator('#ovAgain').click().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('#ovHelp').click();
      await page.locator('#ovMVol').fill('30');
      await page.locator('#ovMusic').click();
      const a = await page.evaluate(() => ({ m: window.__wz.music(), pressed: document.getElementById('ovMusic').getAttribute('aria-pressed'), on: localStorage.getItem('wz.musica'), vol: localStorage.getItem('wz.musica.volume') }));
      check(!a.m.on && !a.m.timer && a.m.mode === 'off' && a.pressed === 'false' && a.on === '0' && a.vol === '0.30',
        `${name}: «Musica» si spegne (premuto ${a.pressed}, modo ${a.m.mode}) e il volume va al 30% (salvati: wz.musica=${a.on}, wz.musica.volume=${a.vol})`);
      await page.reload(); await page.waitForTimeout(500);
      await gesture(page, touch, '#ovt');
      await page.waitForTimeout(1500);
      const b = await page.evaluate(() => window.__wz.music());
      await page.locator('#ovHelp').click();
      const ui = await page.evaluate(() => ({ pressed: document.getElementById('ovMusic').getAttribute('aria-pressed'), txt: document.getElementById('ovMusic').textContent, vol: document.getElementById('ovMVol').value, vv: document.getElementById('ovMVolV').textContent }));
      check(!b.on && Math.abs(b.volume - 0.3) < 1e-6 && b.ctx === 'running' && !b.played && ui.pressed === 'false' && ui.vol === '30',
        `${name}: dopo il ricaricamento la musica resta spenta e muta anche dopo un gesto (note ${b.played || 0}) e il volume resta al 30% («${ui.txt.trim()}», cursore ${ui.vol}, ${ui.vv})`);
      await page.locator('#ovMusic').click();
      // la prima nota cade sulla battuta del giro in corso: può arrivare fino a 3,3 s dopo (come al punto 7)
      const tOn = await waitMusic(page, m => m.on && m.timer && m.played > 0, 5);
      const c = await page.evaluate(() => window.__wz.music());
      check(tOn >= 0 && c.on && c.timer && c.played > 0 && Math.abs(c.volume - 0.3) < 1e-6, `${name}: riaccesa, la musica riparte al volume salvato (note ${c.played} in ${tOn < 0 ? 'più di 5' : sec(tOn)} s, volume ${c.volume})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    // 7. Con «Suono» spento la musica tace (contesto audio fermo o uscita a zero), riacceso torna.
    {
      if (await page.locator('#ovStart').isVisible()) await page.locator('#ovStart').click();
      await page.waitForTimeout(500);
      await openMenu(page); // su telefono «Suono» sta nel cassetto «Menu»
      await page.locator('#btnSound').click();
      await page.waitForTimeout(700);
      const a = await page.evaluate(() => ({ ...window.__wz.music(), rms: window.__rms(), en: window.__wz.audio().enabled }));
      await page.waitForTimeout(1000);
      const b = await page.evaluate(() => ({ ...window.__wz.music(), rms: window.__rms() }));
      const silent = x => x.ctx !== 'running' || x.rms < 1e-4;
      check(!a.en && silent(a) && silent(b) && (b.ctx !== 'running' ? b.played === a.played : true),
        `${name}: con «Suono» spento la musica tace (contesto ${b.ctx}, livello ${b.rms.toFixed(4)}, note ${a.played} → ${b.played})`);
      await openMenu(page);
      await page.locator('#btnSound').click();
      // la musica riprende dal punto del giro in cui è l'orologio: la prossima nota può essere a una battuta (3,3 s)
      const tBack = await waitMusic(page, m => m.ctx === 'running' && m.played > b.played, 5);
      const c = await page.evaluate(() => ({ ...window.__wz.music(), rms: window.__rms() }));
      check(tBack >= 0 && c.rms > 0.001, `${name}: riacceso «Suono», la musica riprende (note ${b.played} → ${c.played} in ${tBack < 0 ? 'più di 5' : sec(tBack)} s, livello ${c.rms.toFixed(3)})`);
    }
    check(errors.length === 0, `${name}: nessun errore JavaScript con la musica${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
}

// Lancio da solo: node tests/e2e/musica.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runMusicChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della musica sono passati.');
}
