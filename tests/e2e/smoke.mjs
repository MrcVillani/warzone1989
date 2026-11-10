// Prova di fumo nel browser: apre dist/index.html, avvia una partita, simula qualche minuto,
// controlla che non ci siano errori e salva gli screenshot in tests/e2e/out/.
// Uso: npm run e2e   (richiede Playwright con Chromium installato nel sistema)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { runCommandChecks } from './comandi.mjs';
import { runPhaseBChecks } from './faseb.mjs';
import { runCampaignChecks } from './campagna.mjs';
import { runPhoneChecks } from './telefono.mjs';
import { runMusicChecks } from './musica.mjs';
import { runOstChecks } from './ost.mjs';
import { runLayoutBChecks, lbLayout } from './layoutb.mjs';

// Playwright si carica con require: così vale anche l'installazione globale del sistema.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(path.join(root, 'dist/index.html')).href;

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
// Problema noto, già segnalato e non ancora corretto: lo stampa ma non fa fallire la prova.
const known = [];
const todo = (ok, msg) => { if (!ok) known.push(msg); console.log(`${ok ? 'ok  ' : 'TODO'} ${msg}`); };

const browser = await chromium.launch();
// Profili: computer, telefono in verticale e telefono in orizzontale (l'app Android gira solo in orizzontale).
const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const profiles = [
  ['desktop', { viewport: { width: 1280, height: 800 } }],
  ['telefono', devices['Pixel 7']],
  ['telefono-orizzontale', landscape],
];
const only = process.env.E2E_PROFILE; // per provare un solo profilo: E2E_PROFILE=telefono-orizzontale
for (const [name, opts] of profiles.filter(([n]) => !only || n === only)) {
  const page = await browser.newPage(opts);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(url);
  await page.waitForTimeout(500);
  check(await page.locator('#ovStart').isVisible(), `${name}: la copertina mostra «Inizia l’operazione»`);
  await page.locator('#ovStart').click();
  check(await page.locator('#overlay').isHidden(), `${name}: la copertina si chiude all’avvio`);

  // Il geniere va su un giacimento vicino e costruisce una pompa.
  const pump = await page.evaluate(() => {
    const { engine: W } = window.__wz, S = W.S;
    const b = S.ents.find(e => e.owner === 0 && e.builder);
    const d = W.deposits.filter(d => W.explored[d.x + d.y * W.MW]).sort((a, c) => Math.hypot(a.x - b.x / 32, a.y - b.y / 32) - Math.hypot(c.x - b.x / 32, c.y - b.y / 32))[0];
    const s = W.placeStruct(0, 'pump', d.x, d.y); W.cmdBuild([b], s);
    for (let i = 0; i < 20 * 40; i++) W.step(0.05);
    return { built: s.built, dead: !!s.dead };
  });
  check(pump.built >= 1 && !pump.dead, `${name}: un geniere costruisce una pompa in meno di 40 s`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, `${name}-partita.png`) });

  // Disposizione: barra, mappa e pannello tutti visibili, dentro lo schermo e non sovrapposti.
  const lay = await page.evaluate(() => {
    const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    return { vw: window.innerWidth, vh: window.innerHeight, bar: r('bar'), stage: r('stage'), panel: r('panel'), tabs: r('tabs') };
  });
  const inside = b => b.w > 0 && b.h > 0 && b.x >= -0.5 && b.y >= -0.5 && b.r <= lay.vw + 0.5 && b.b <= lay.vh + 0.5;
  check(inside(lay.bar) && inside(lay.stage) && inside(lay.panel), `${name}: barra, mappa e pannello dentro lo schermo ${lay.vw}×${lay.vh}`);
  // Computer: plancia classica, barra in alto sopra mappa e pannello. Telefono (disposizione B, piano 05): mappa a
  // tutto schermo con striscia, ordini, minimappa e barra delle schede sopra, che non devono coprirsi tra loro.
  const lb = await page.evaluate(lbLayout);
  check(lb.lb === !!opts.hasTouch, `${name}: disposizione ${lb.lb ? 'B (telefono)' : 'classica (computer)'}`);
  if (!lb.lb) check(lay.bar.b <= lay.stage.y + 0.5 && lay.bar.b <= lay.panel.y + 0.5, `${name}: la barra non copre mappa e pannello`);
  else check(!lb.overlaps.length && !lb.outside.length && lb.drawerHidden && lb.mapFree,
    `${name}: la barra delle schede non copre la striscia, il cassetto chiuso lascia libera la mappa e striscia, selezione, ordini, minimappa e barra non si sovrappongono (${lb.overlaps.length ? 'sovrapposti: ' + lb.overlaps.join(', ') : 'nessuna sovrapposizione'}${lb.outside.length ? '; fuori: ' + lb.outside.join(', ') : ''})`);
  check(lay.stage.w >= 0.45 * lay.vw && lay.stage.h >= 0.4 * lay.vh,
    `${name}: la mappa occupa abbastanza spazio (${Math.round(lay.stage.w)}×${Math.round(lay.stage.h)})`);
  // Le schede del pannello (Costruisci, Produzione…) si raggiungono scorrendo il pannello e rispondono al tocco.
  await page.locator('#tabs button[data-tab="prod"]').scrollIntoViewIfNeeded();
  await page.locator('#tabs button[data-tab="prod"]').click();
  const tabOn = await page.evaluate(() => document.querySelector('#tabs button[data-tab="prod"]').classList.contains('on'));
  check(tabOn, `${name}: la scheda «Produzione» del pannello si raggiunge e si apre`);
  await page.locator('#tabs button[data-tab="build"]').click();
  await page.evaluate(() => { document.getElementById('panel').scrollTop = 0; });
  // Senza scorrere il pannello, le schede devono essere già in vista (anche in orizzontale, dove prima la carta
  // le spingeva sotto il bordo).
  check(lay.tabs.y >= lay.panel.y - 0.5 && lay.tabs.b <= lay.panel.b + 0.5,
    `${name}: le schede del pannello sono in vista senza scorrerlo (schede a y=${Math.round(lay.tabs.y)}, fondo del pannello a ${Math.round(lay.panel.b)})`);

  // Con il giocatore fermo, l'IA deve attaccare e vincere entro 15 minuti di gioco.
  const end = await page.evaluate(() => {
    const W = window.__wz;
    for (let i = 0; i < 20 * 60 * 15 && W.S.phase === 'play'; i++) W.step(0.05);
    return { phase: W.S.phase, time: Math.round(W.S.time), wave: W.S.ai.wave, seed: W.S.seed };
  });
  check(end.phase === 'lost' && end.wave >= 1, `${name}: l’IA attacca e vince contro un giocatore fermo (${end.time} s, ondate ${end.wave}, seme della mappa ${end.seed})`);
  await page.waitForTimeout(300);
  check(await page.locator('#ovAgain').isVisible(), `${name}: compare il rapporto finale`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, `${name}: nessuno scorrimento orizzontale della pagina`);
  check(errors.length === 0, `${name}: nessun errore JavaScript${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}
// Comandi con un clic, «Tutto l'esercito», Esc, pulsante «Suono» e «riduci movimento» (tests/e2e/comandi.mjs).
await runCommandChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
// Fase B: schede Ricerca, Progetta e Costruisci, battaglia con le armi nuove, qualità degli effetti (tests/e2e/faseb.mjs).
await runPhaseBChecks({ browser, url, check, todo, profiles: profiles.filter(([n]) => !only || n === only) });
// Campagna: menu, briefing, obiettivo, Ricerca con il livello massimo, rapporti, salvataggio (tests/e2e/campagna.mjs).
await runCampaignChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
// Gesti su telefono con tocchi veri (CDP) e computer invariato: piano 04 (tests/e2e/telefono.mjs).
await runPhoneChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
// Colonna sonora: primo gesto, menu, calma e battaglia, nebbia, comandi salvati, «Suono» spento (tests/e2e/musica.mjs).
await runMusicChecks({ browser, url, check, todo, profiles: profiles.filter(([n]) => !only || n === only) });
// Colonna sonora della campagna: profilo per missione, fase 2 di «Contrattacco», schermaglia e menu invariati, «Valle
// liberata», nessuna nota appesa, musica spenta, profili validi, album in dist/ost (tests/e2e/ost.mjs).
await runOstChecks({ browser, url, check, profiles: profiles.filter(([n]) => !only || n === only) });
// Disposizione B per telefono con tocchi veri (851×393, 740×360, Pixel 7) e computer invariato: piano 05 (tests/e2e/layoutb.mjs).
await runLayoutBChecks({ browser, url, check, todo, only });
await browser.close();
if (known.length) console.log(`\n${known.length} problemi noti (TODO), non bloccanti:\n- ${known.join('\n- ')}`);
if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
console.log('\nTutti i controlli sono passati.');
