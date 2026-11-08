// Campagna nel browser: menu principale (Campagna e Schermaglia), briefing, indicatore dell'obiettivo, scheda Ricerca
// con il livello massimo della missione, conferma di «Menu» in partita, rapporto di sconfitta («Riprova») e di vittoria
// («Missione successiva»), salvataggio in localStorage (wz.campagna) che regge il ricaricamento, elenco delle missioni
// con quelle bloccate, «Ricomincia la campagna» con conferma.
// Le richiama smoke.mjs (npm run e2e); si possono lanciare anche da sole: npm run build && node tests/e2e/campagna.mjs
// Vittoria e sconfitta si forzano con window.__wz (edifici e genieri distrutti, pompe pronte), poi si avanza la
// simulazione finché il motore chiude la missione: il rapporto è quello vero del client.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
const KEY = 'wz.campagna';

async function press(page, touch, sel, force = false) {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded();
  if (touch) await l.tap({ force }); else await l.click({ force });
  await page.waitForTimeout(120);
}
const txt = (page, sel) => page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
const hScroll = page => page.evaluate(() => {
  const o = document.getElementById('overlay');
  return document.documentElement.scrollWidth > window.innerWidth + 0.5 || (!o.hidden && o.scrollWidth > o.clientWidth + 0.5);
});
const saved = page => page.evaluate(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return 'illeggibile'; } }, KEY);

// Strumenti dentro la pagina: fine missione forzata.
function installHelpers() {
  const W = window.__wz, E = W.engine;
  const advance = (secs = 3) => { for (let i = 0; i < secs / 0.05 && E.S.phase === 'play'; i++) E.step(0.05); return E.S.phase; };
  window.__cp = {
    // Sconfitta: il giocatore perde comando, fabbriche e genieri.
    lose() {
      for (const e of E.S.ents.filter(e => !e.dead && e.owner === 0 && (e.type === 'hq' || e.type === 'factory' || e.builder))) E.kill(e, 1);
      return advance();
    },
    // Vittoria della missione 1 (avamposto): le pompe richieste pronte sui giacimenti liberi più vicini alla base,
    // poi edifici e genieri nemici distrutti (i genieri rimetterebbero subito una pompa).
    winOutpost() {
      const need = E.S.objective.need, b = E.B0;
      const free = E.deposits.filter(d => !E.occ[d.x + d.y * E.MW]).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
      for (const d of free.slice(0, need)) E.makeStruct('pump', 0, d.x, d.y, true);
      for (const e of E.S.ents.filter(e => !e.dead && e.owner === 1 && (e.kind === 'struct' || e.builder))) E.kill(e, 0);
      return advance();
    },
    // Laboratorio del giocatore già pronto accanto al comando.
    lab() {
      const c = E.B0;
      for (let r = 0; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
        if (E.canPlace(0, 'lab', c.x + 3 + dx, c.y + 1 + dy)) return E.makeStruct('lab', 0, c.x + 3 + dx, c.y + 1 + dy, true).id;
      return null;
    },
  };
}

export async function runCampaignChecks({ browser, url, check, profiles }) {
  mkdirSync(outDir, { recursive: true });
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); if (process.env.E2E_STACK) console.log(e.stack); });
    await page.goto(url);
    await page.evaluate(k => { try { localStorage.removeItem(k); } catch (e) { /* niente */ } }, KEY);
    await page.reload(); await page.waitForTimeout(400);
    const scroll = [];
    const noScroll = async where => { if (await hScroll(page)) scroll.push(where); };

    // 1. Menu principale: Campagna e Schermaglia, campagna nuova.
    const menu = await page.evaluate(() => ({
      kinds: [...document.querySelectorAll('#overlay .mode .mk')].map(e => e.textContent.trim()),
      camp: document.getElementById('ovCamp')?.textContent.trim(), skirm: document.getElementById('ovStart')?.textContent.trim(),
      missions: !!document.getElementById('ovMissions'), ov: window.__wz.ui.overlay,
    }));
    check(menu.ov === 'start' && menu.kinds.join(',') === 'Campagna,Schermaglia' && menu.camp === 'Inizia la campagna' && menu.skirm === 'Inizia la schermaglia' && !menu.missions,
      `${name}: il menu principale offre Campagna («${menu.camp}») e Schermaglia («${menu.skirm}»), senza «Missioni» a campagna nuova`);
    await noScroll('menu');
    await page.screenshot({ path: path.join(outDir, `${name}-campagna-menu.png`) });

    // 2. «Inizia la campagna» apre il briefing della missione 1.
    await press(page, touch, '#ovCamp');
    const brief = await page.evaluate(() => ({
      ov: window.__wz.ui.overlay, mission: window.__wz.S.mission, eyebrow: document.querySelector('#overlay .eyebrow')?.textContent,
      title: document.getElementById('ovt')?.textContent.replace(/\s+/g, ' ').trim(), obj: document.querySelector('#overlay .bfacts .obj dd')?.textContent,
      go: !!document.getElementById('ovGo'), map: !!document.getElementById('briefMap'),
    }));
    const M0 = await page.evaluate(() => ({ name: window.__wz.engine.MISSIONS[0].name, label: window.__wz.engine.objectiveLabel(window.__wz.engine.MISSIONS[0].objective) }));
    check(brief.ov === 'brief' && brief.mission === 'testa-di-ponte' && /^Missione 1 di 8/.test(brief.eyebrow || '') && brief.title === `01 ${M0.name}` && brief.obj === M0.label && brief.go && brief.map,
      `${name}: «Inizia la campagna» apre il briefing della missione 1 («${brief.title}», obiettivo «${brief.obj}»)`);
    await noScroll('briefing');
    await page.screenshot({ path: path.join(outDir, `${name}-campagna-briefing.png`) });

    // 3. «Inizia la missione»: indicatore dell'obiettivo con il testo del motore.
    await press(page, touch, '#ovGo');
    await page.waitForTimeout(300);
    await page.evaluate(installHelpers);
    const hud = await page.evaluate(() => {
      const box = document.getElementById('objective'), r = box.getBoundingClientRect(), bar = document.getElementById('bar').getBoundingClientRect();
      return {
        ov: { kind: window.__wz.ui.overlay, hidden: document.getElementById('overlay').hidden }, visible: !box.hidden && r.width > 0 && r.height > 0, text: document.getElementById('objText').textContent, kind: document.getElementById('objKind').textContent,
        engine: window.__wz.S.objective.text, phase: window.__wz.S.phase, paused: window.__wz.ui.paused,
        inside: r.left >= -0.5 && r.top >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5, belowBar: r.top >= bar.bottom - 0.5,
      };
    });
    check(hud.ov.kind === null && hud.ov.hidden && hud.visible && hud.text === hud.engine && /Pompe attive: 0\/6/.test(hud.text) && hud.kind === 'Obiettivo' && hud.phase === 'play' && !hud.paused,
      `${name}: «Inizia la missione» chiude il briefing e mostra l’indicatore con il testo del motore («${hud.text}»)`);
    check(hud.inside && hud.belowBar, `${name}: l’indicatore dell’obiettivo è dentro lo schermo e sotto la barra`);
    await page.screenshot({ path: path.join(outDir, `${name}-campagna-obiettivo.png`) });

    // 4. Scheda Ricerca nella missione 1 (livello massimo I): i livelli II–IV non sono disponibili.
    {
      await page.evaluate(() => { window.__wz.ui.paused = true; window.__cp.lab(); });
      await press(page, touch, '#tabs button[data-tab="res"]');
      await page.waitForTimeout(300);
      const heads = await page.evaluate(() => [...document.querySelectorAll('#tabbody [data-act="tier"]')].map(b => ({
        t: +b.dataset.t, state: b.querySelector('.ts').textContent, capped: b.classList.contains('capped'), dis: b.getAttribute('aria-disabled'), open: b.getAttribute('aria-expanded'),
      })));
      const hi = heads.filter(h => h.t > 1), h1 = heads.find(h => h.t === 1) || {};
      check(heads.length === 4 && hi.length === 3 && hi.every(h => h.capped && h.dis === 'true' && h.open === 'false' && /^Non disponibile in questa missione \(livello max I\)/.test(h.state)),
        `${name}: in missione 1 la scheda Ricerca mostra i livelli II–IV come non disponibili in questa missione («${(hi[0] || {}).state}»)`);
      check(!h1.capped && h1.open === 'true' && /^aperto/.test(h1.state || ''), `${name}: il livello I resta aperto («${h1.state}»)`);
      // l'intestazione ha aria-disabled: Playwright la considera spenta, il clic si forza come farebbe un giocatore
      await press(page, touch, '#tabbody [data-act="tier"][data-t="3"]', true);
      const after = await page.evaluate(() => ({
        open: document.querySelector('#tabbody [data-act="tier"][data-t="3"]').getAttribute('aria-expanded'),
        items: document.querySelectorAll('#tabbody [data-act="research"][data-id="chH"]').length,
        toast: [...document.querySelectorAll('#toasts .toast')].map(e => e.textContent).join(' | '),
      }));
      check(after.open === 'false' && after.items === 0 && /Livello III non disponibile in questa missione/.test(after.toast),
        `${name}: un ${touch ? 'tocco' : 'clic'} sul livello III non lo apre e lo spiega (aperto ${after.open}, voci ${after.items}, avviso «${after.toast}»)`);
      await press(page, touch, '#tabs button[data-tab="build"]');
      await page.evaluate(() => { window.__wz.ui.paused = false; document.getElementById('btnPause').textContent = 'Pausa'; document.getElementById('btnPause').classList.remove('on'); });
    }

    // 5. «Menu» in partita chiede conferma; «Continua a giocare» la chiude e la missione resta.
    {
      const t0 = await page.evaluate(() => window.__wz.S.time);
      await press(page, touch, '#btnExit');
      const ask = await page.evaluate(() => ({
        ov: window.__wz.ui.overlay, title: document.getElementById('ovt')?.textContent, stay: !!document.getElementById('ovStay'), leave: !!document.getElementById('ovLeave'),
      }));
      check(ask.ov === 'exit' && ask.title === 'Lasciare la missione?' && ask.stay && ask.leave,
        `${name}: «Menu» in partita chiede conferma («${ask.title}»)`);
      await noScroll('conferma d’uscita');
      await press(page, touch, '#ovStay');
      await page.waitForTimeout(400);
      const back = await page.evaluate(() => ({ ...{ kind: window.__wz.ui.overlay, hidden: document.getElementById('overlay').hidden }, mission: window.__wz.S.mission, phase: window.__wz.S.phase, t: window.__wz.S.time, paused: window.__wz.ui.paused, obj: !document.getElementById('objective').hidden }));
      check(back.kind === null && back.hidden && back.mission === 'testa-di-ponte' && back.phase === 'play' && back.t >= t0 && !back.paused && back.obj,
        `${name}: «Continua a giocare» chiude la conferma e la missione prosegue (tempo ${t0.toFixed(1)} → ${back.t.toFixed(1)} s)`);
    }

    // 6. Sconfitta forzata: rapporto «Missione fallita» con «Riprova», che riavvia la missione 1 da capo.
    {
      const phase = await page.evaluate(() => window.__cp.lose());
      await page.waitForTimeout(300);
      const rep = await page.evaluate(() => ({
        ov: window.__wz.ui.overlay, title: document.getElementById('ovt')?.textContent.replace(/\s+/g, ' ').trim(),
        retry: document.getElementById('ovRetry')?.textContent, next: !!document.getElementById('ovNext'),
      }));
      check(phase === 'lost' && rep.ov === 'end' && rep.title === 'Missione fallita' && rep.retry === 'Riprova' && !rep.next,
        `${name}: con la sconfitta compare il rapporto «${rep.title}» con «${rep.retry}»`);
      await noScroll('rapporto di sconfitta');
      const camp = await saved(page);
      check(camp === null || (camp.unlocked === 1 && camp.done.length === 0), `${name}: la sconfitta non cambia la campagna salvata`);
      await press(page, touch, '#ovRetry');
      await page.waitForTimeout(300);
      const again = await page.evaluate(() => ({ kind: window.__wz.ui.overlay, mission: window.__wz.S.mission, phase: window.__wz.S.phase, t: window.__wz.S.time, text: document.getElementById('objText').textContent, eng: window.__wz.S.objective.text, hq: window.__wz.S.ents.some(e => !e.dead && e.owner === 0 && e.type === 'hq') }));
      check(again.kind === null && again.mission === 'testa-di-ponte' && again.phase === 'play' && again.t < 5 && again.hq && again.text === again.eng,
        `${name}: «Riprova» riavvia la missione 1 da capo (tempo ${again.t.toFixed(1)} s, obiettivo «${again.text}»)`);
    }

    // 7. Vittoria forzata: rapporto con «Missione successiva», campagna salvata.
    {
      await page.evaluate(installHelpers);
      const phase = await page.evaluate(() => window.__cp.winOutpost());
      await page.waitForTimeout(300);
      const rep = await page.evaluate(() => ({
        ov: window.__wz.ui.overlay, title: document.getElementById('ovt')?.textContent.replace(/\s+/g, ' ').trim(),
        next: document.getElementById('ovNext')?.textContent, retry: !!document.getElementById('ovRetry'),
        hint: [...document.querySelectorAll('#overlay .hint')].map(e => e.textContent).join(' '),
      }));
      check(phase === 'won' && rep.ov === 'end' && rep.title === 'Missione compiuta' && rep.next === 'Missione successiva' && !rep.retry && /Sbloccata: missione 2/.test(rep.hint),
        `${name}: con la vittoria compare il rapporto «${rep.title}» con «${rep.next}» («${rep.hint.trim()}»)`);
      await noScroll('rapporto di vittoria');
      await page.screenshot({ path: path.join(outDir, `${name}-campagna-rapporto.png`) });
      const camp = await saved(page);
      check(camp && camp.unlocked === 2 && camp.done.join(',') === 'testa-di-ponte' && camp.best && camp.best['testa-di-ponte'] >= 0,
        `${name}: la vittoria si salva in localStorage «${KEY}» (sbloccate ${camp && camp.unlocked}, vinte ${camp && camp.done})`);
      await press(page, touch, '#ovNext');
      const b2 = await page.evaluate(() => ({ ov: window.__wz.ui.overlay, mission: window.__wz.S.mission, eyebrow: document.querySelector('#overlay .eyebrow')?.textContent }));
      check(b2.ov === 'brief' && b2.mission === 'pozzi-del-guado' && /^Missione 2 di 8/.test(b2.eyebrow || ''), `${name}: «Missione successiva» apre il briefing della missione 2`);
    }

    // 8. Dopo il ricaricamento: «Riprendi: missione 2», e nell'elenco la missione 3 è bloccata.
    {
      await page.reload(); await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({ ov: window.__wz.ui.overlay, camp: document.getElementById('ovCamp')?.textContent.trim(), missions: !!document.getElementById('ovMissions'), info: document.querySelector('#overlay .mode .mp')?.textContent }));
      check(m.ov === 'start' && /^Riprendi: missione 2 · /.test(m.camp || '') && m.missions && /^1\/8 missioni vinte/.test(m.info || ''),
        `${name}: dopo il ricaricamento il menu dice «${m.camp}» («${m.info}»)`);
      await press(page, touch, '#ovMissions');
      const list = await page.evaluate(() => [...document.querySelectorAll('#overlay [data-mission]')].map(b => ({ i: +b.dataset.mission, dis: b.disabled, cls: b.className, st: b.querySelector('.fst')?.textContent })));
      const by = i => list.find(f => f.i === i) || {};
      check(list.length === 8 && /done/.test(by(0).cls) && /^Completata/.test(by(0).st || '') && !by(1).dis && /open/.test(by(1).cls) && /next/.test(by(1).cls)
        && by(2).dis && /locked/.test(by(2).cls) && by(2).st === 'Bloccata' && list.slice(2).every(f => f.dis),
        `${name}: nell’elenco la missione 1 è completata, la 2 disponibile e la 3 bloccata («${by(0).st}», «${by(1).st}», «${by(2).st}»)`);
      await noScroll('elenco delle missioni');
      await page.locator('#overlay [data-mission="2"]').click({ force: true }).catch(() => {});
      await page.waitForTimeout(150);
      const still = await page.evaluate(() => ({ ov: window.__wz.ui.overlay, mission: window.__wz.S.mission }));
      check(still.ov === 'campaign' && still.mission !== 'colonna-rifornimenti', `${name}: la missione 3 bloccata non si apre`);
    }

    // 9. «Ricomincia la campagna» chiede conferma; «Annulla» non tocca nulla; «Sì, ricomincia» azzera i progressi.
    {
      await press(page, touch, '#ovReset');
      const ask = await page.evaluate(() => ({ yes: !!document.getElementById('ovResetYes'), no: !!document.getElementById('ovResetNo'), msg: document.querySelector('#overlay .confirm p')?.textContent }));
      check(ask.yes && ask.no && /^Ricominciare da capo\?/.test(ask.msg || ''), `${name}: «Ricomincia la campagna» chiede conferma («${ask.msg}»)`);
      await press(page, touch, '#ovResetNo');
      const kept = await saved(page);
      check(kept && kept.unlocked === 2 && kept.done.length === 1, `${name}: «Annulla» lascia la campagna com’era`);
      await press(page, touch, '#ovReset');
      await press(page, touch, '#ovResetYes');
      const camp = await saved(page);
      const stat = await txt(page, '#overlay .cstat');
      const list = await page.evaluate(() => [...document.querySelectorAll('#overlay [data-mission]')].map(b => b.disabled));
      check(camp && camp.unlocked === 1 && camp.done.length === 0 && Object.keys(camp.tech).length === 0 && Object.keys(camp.best).length === 0 && list[0] === false && list.slice(1).every(Boolean) && /^0\/8/.test(stat || ''),
        `${name}: «Sì, ricomincia» azzera i progressi (salvato: sbloccate ${camp && camp.unlocked}, vinte ${camp && camp.done.length}; «${stat}»)`);
      await press(page, touch, '#ovBack');
      const m = await page.evaluate(() => ({ ov: window.__wz.ui.overlay, camp: document.getElementById('ovCamp')?.textContent.trim(), missions: !!document.getElementById('ovMissions') }));
      check(m.ov === 'start' && m.camp === 'Inizia la campagna' && !m.missions, `${name}: di nuovo nel menu la campagna riparte da capo («${m.camp}»)`);
    }

    check(!scroll.length, `${name}: nessuno scorrimento orizzontale nelle schermate della campagna${scroll.length ? ' (' + scroll.join(', ') + ')' : ''}`);
    check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove della campagna${errors.length ? ': ' + errors.join(' | ') : ''}`);
    await page.close();
  }
}

// Lancio da solo: node tests/e2e/campagna.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const profiles = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  await runCampaignChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
  await browser.close();
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli della campagna sono passati.');
}
