// Prova di fumo nel browser: apre dist/index.html, avvia una partita, simula qualche minuto,
// controlla che non ci siano errori e salva gli screenshot in tests/e2e/out/.
// Uso: npm run e2e   (richiede Playwright con Chromium installato nel sistema)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Playwright si carica con require: così vale anche l'installazione globale del sistema.
const { chromium, devices } = createRequire(import.meta.url)('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
mkdirSync(outDir, { recursive: true });
const url = pathToFileURL(path.join(root, 'dist/index.html')).href;

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const browser = await chromium.launch();
for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']]]) {
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

  // Con il giocatore fermo, l'IA deve attaccare e vincere entro 15 minuti di gioco.
  const end = await page.evaluate(() => {
    const W = window.__wz;
    for (let i = 0; i < 20 * 60 * 15 && W.S.phase === 'play'; i++) W.step(0.05);
    return { phase: W.S.phase, time: Math.round(W.S.time), wave: W.S.ai.wave };
  });
  check(end.phase === 'lost' && end.wave >= 1, `${name}: l’IA attacca e vince contro un giocatore fermo (${end.time} s, ondate ${end.wave})`);
  await page.waitForTimeout(300);
  check(await page.locator('#ovAgain').isVisible(), `${name}: compare il rapporto finale`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, `${name}: nessuno scorrimento orizzontale della pagina`);
  check(errors.length === 0, `${name}: nessun errore JavaScript${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.close();
}
await browser.close();
if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
console.log('\nTutti i controlli sono passati.');
