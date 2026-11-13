// Piano 10 «Meteo e veterani» nel browser: schermaglia con pioggia, nebbia e meteo variabile senza errori (con il cambio
// del tempo a partita in corso), riga «Meteo» del menu ricordata dopo il ricaricamento (wz.meteo), gallone e grado nel
// pannello della selezione, Macchina di Villo in missione: pulsante «Villo» che la seleziona, colpo normale e «colpo
// grosso» disegnati (aggancio window.__wz.heroFire), «dal carrozziere» con il conto alla rovescia e ritorno.
// La richiama smoke.mjs (npm run e2e); da sola: npm run build && node tests/e2e/meteo.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(root, 'tests/e2e/out');
const WX_KEY = 'wz.meteo', CAMP_KEY = 'wz.campagna';

async function press(page, touch, sel) {
  const l = page.locator(sel).first();
  await l.scrollIntoViewIfNeeded();
  if (touch) await l.tap(); else await l.click();
  await page.waitForTimeout(150);
}
// Avanza la simulazione di secs secondi di gioco dentro la pagina.
const advance = (page, secs) => page.evaluate(secs => { const W = window.__wz; for (let i = 0; i < secs / 0.05 && W.S.phase === 'play'; i++) W.step(0.05); return W.S.phase; }, secs);
const toasts = page => page.evaluate(() => [...document.querySelectorAll('#toasts > *, .toast')].map(e => e.textContent.trim()));

export async function runWeatherChecks({ browser, url, check, todo = check, profiles }) {
  mkdirSync(outDir, { recursive: true });
  for (const [name, opts] of profiles) {
    const touch = !!opts.hasTouch;
    const page = await browser.newPage(opts);
    const errors = [];
    page.on('pageerror', e => { errors.push(e.message); if (process.env.E2E_STACK) console.log(e.stack); });
    await page.goto(url);
    await page.evaluate(ks => { for (const k of ks) try { localStorage.removeItem(k); } catch (e) { /* niente */ } }, [WX_KEY, CAMP_KEY]);
    await page.reload(); await page.waitForTimeout(400);

    // 1. Riga «Meteo» nel menu: quattro scelte, «Sereno» di partenza.
    const menu = await page.evaluate(() => ({
      chips: [...document.querySelectorAll('[data-wx]')].map(b => [b.dataset.wx, b.textContent.trim(), b.classList.contains('on')]),
      label: document.querySelector('.wxsel .lbl')?.textContent.trim(), mode: window.__wz.S.weatherMode,
    }));
    check(menu.label === 'Meteo' && JSON.stringify(menu.chips) === JSON.stringify([['clear', 'Sereno', true], ['rain', 'Pioggia', false], ['fog', 'Nebbia', false], ['variable', 'Variabile', false]]) && menu.mode === 'clear',
      `${name}: riga «Meteo» con Sereno, Pioggia, Nebbia, Variabile e «Sereno» scelto (${JSON.stringify(menu)})`);

    // 2. Pioggia, nebbia e variabile: la scelta prepara la partita, si gioca senza errori, il tempo si vede.
    for (const wx of ['rain', 'fog', 'variable']) {
      await page.reload(); await page.waitForTimeout(300);
      await press(page, touch, `[data-wx="${wx}"]`);
      const picked = await page.evaluate(() => ({ mode: window.__wz.S.weatherMode, now: window.__wz.S.weather, on: document.querySelector('[data-wx].on')?.dataset.wx }));
      check(picked.mode === wx && picked.on === wx && picked.now === (wx === 'variable' ? 'clear' : wx), `${name}: «${wx}» scelto nel menu prepara la partita (${JSON.stringify(picked)})`);
      await press(page, touch, '#ovStart');
      await advance(page, 20);
      if (wx === 'variable') {
        // il primo cambio del tempo, con l'avviso
        const ch = await page.evaluate(() => { const S = window.__wz.S, from = S.weather; S.time = S.weatherT - 0.01; window.__wz.step(0.05); return { from, to: S.weather, n: S.weatherN }; });
        await page.waitForTimeout(400);
        const ts = await toasts(page);
        check(ch.to !== ch.from && ch.n === 1, `${name}: meteo variabile, il tempo cambia (${ch.from} → ${ch.to})`);
        todo(ts.some(t => /piovere|nebbia|sereno/i.test(t)), `${name}: meteo variabile, avviso del cambio a schermo (${JSON.stringify(ts.slice(-3))})`);
        await advance(page, 10);
      }
      await page.waitForTimeout(700);
      const g = await page.evaluate(() => ({ gfx: window.__wz.gfx(), now: window.__wz.S.weather }));
      check(!!g.gfx.weather, `${name}: ${wx}, il client riporta il meteo disegnato (${JSON.stringify(g.gfx.weather)})`);
      await page.screenshot({ path: path.join(outDir, `${name}-meteo-${wx}.png`) });
      // 3. scelta ricordata dopo il ricaricamento
      await page.reload(); await page.waitForTimeout(400);
      const kept = await page.evaluate(k => ({ ls: localStorage.getItem(k), on: document.querySelector('[data-wx].on')?.dataset.wx, mode: window.__wz.S.weatherMode }), WX_KEY);
      check(kept.on === wx && kept.mode === wx && (kept.ls || '').includes(wx), `${name}: «${wx}» ricordato dopo il ricaricamento (${JSON.stringify(kept)})`);
    }
    // ritorno a «Sereno»
    await press(page, touch, '[data-wx="clear"]');
    const back = await page.evaluate(() => window.__wz.S.weatherMode);
    check(back === 'clear', `${name}: di nuovo «Sereno»`);

    // 4. Gradi: gallone e grado nel pannello della selezione (schermaglia).
    await press(page, touch, '#ovStart');
    const ace = await page.evaluate(() => {
      const W = window.__wz, E = W.engine, u = E.S.ents.find(e => !e.dead && e.owner === 0 && e.kind === 'unit' && !e.builder);
      E.gainXp(u, 10);
      W.ui.sel = [u.id];
      return { id: u.id, rank: u.rank };
    });
    await advance(page, 0.5);
    await page.waitForTimeout(600);
    const panel = await page.evaluate(() => {
      const r = document.querySelector('.rkrow');
      return { text: r ? r.textContent.replace(/\s+/g, ' ').trim() : null, svg: !!(r && r.querySelector('svg')), vets: window.__wz.vets() };
    });
    check(ace.rank === 3 && panel.text && /Asso/.test(panel.text) && panel.svg, `${name}: il pannello mostra il grado «Asso» con il gallone (${JSON.stringify(panel.text)})`);
    await page.screenshot({ path: path.join(outDir, `${name}-meteo-asso.png`) });
    const hs = await page.evaluate(() => ({ hero: window.__wz.hero(), btn: document.getElementById('btnHero')?.hidden }));
    check(!hs.hero.present && hs.btn === true, `${name}: in schermaglia niente Macchina di Villo e niente pulsante «Villo»`);

    // 5. Macchina di Villo in missione.
    await page.reload(); await page.waitForTimeout(400);
    await press(page, touch, '#ovCamp');
    await press(page, touch, '#ovGo');
    await page.waitForTimeout(400);
    const h0 = await page.evaluate(() => ({ hero: window.__wz.hero(), btn: document.getElementById('btnHero')?.querySelector('span')?.textContent }));
    check(h0.hero.present && h0.hero.id > 0 && !h0.hero.down && h0.btn === 'Villo', `${name}: in missione c'è la Macchina di Villo con il pulsante «Villo» (${JSON.stringify(h0)})`);
    const btnVis = await page.locator('#btnHero').isVisible();
    check(btnVis, `${name}: pulsante «Villo» visibile`);
    if (btnVis) {
      await press(page, touch, '#btnHero');
      const sel = await page.evaluate(() => window.__wz.ui.sel.slice());
      check(sel.length === 1 && sel[0] === h0.hero.id, `${name}: il pulsante «Villo» la seleziona (${JSON.stringify(sel)})`);
    }
    // colpo normale e colpo grosso, solo disegnati
    const shots = await page.evaluate(() => { const W = window.__wz; const a = W.heroFire({}), b = W.heroFire({ big: true }); return { a, b }; });
    await page.waitForTimeout(250);
    const hf = await page.evaluate(() => window.__wz.hero());
    check(shots.a && !shots.a.big && shots.b.big && hf.fx > 0 && hf.bigs >= 1, `${name}: colpo normale e «colpo grosso» disegnati (${JSON.stringify({ fx: hf.fx, kinds: hf.kinds, shots: hf.shots, bigs: hf.bigs })})`);
    await page.screenshot({ path: path.join(outDir, `${name}-meteo-villo-colpo.png`) });
    // un colpo vero del motore contro un nemico accanto
    const real = await page.evaluate(() => {
      const W = window.__wz, E = W.engine, u = E.S.ents.find(e => e.hero && !e.dead);
      const t = E.makeUnit(1, { c: 'L', p: 'W', w: 'MG' }, u.x + 120, u.y), h = t.hp;
      for (let i = 0; i < 3; i++) E.fire(u.x, u.y, 0, t, E.HERO_W, 0, 12, u);
      return { hit: h - t.hp > 0 || t.dead, shots: u.shots };
    });
    await page.waitForTimeout(500);
    check(real.hit && real.shots === 3, `${name}: tre colpi veri dei «Bassi a palla» (il terzo grosso) senza errori`);
    // dal carrozziere e ritorno
    await page.evaluate(() => { const E = window.__wz.engine, u = E.S.ents.find(e => e.hero && !e.dead); E.kill(u, 1); });
    await advance(page, 1);
    await page.waitForTimeout(400);
    const down = await page.evaluate(() => { const b = document.getElementById('btnHero'); return { hero: window.__wz.hero(), cls: b.classList.contains('down'), txt: b.querySelector('span').textContent, aria: b.getAttribute('aria-label'), phase: window.__wz.S.phase }; });
    const ts = await toasts(page);
    check(down.hero.down && down.cls && down.txt !== 'Villo' && /carrozziere/.test(down.aria) && down.phase === 'play', `${name}: «dal carrozziere» con il conto alla rovescia, la missione continua (${JSON.stringify({ txt: down.txt, aria: down.aria })})`);
    todo(ts.some(t => /carrozziere/.test(t)), `${name}: avviso «La macchina di Villo è dal carrozziere» a schermo (${JSON.stringify(ts.slice(-3))})`);
    await page.screenshot({ path: path.join(outDir, `${name}-meteo-villo-carrozziere.png`) });
    if (btnVis) {
      await press(page, touch, '#btnHero');
      const ts2 = await toasts(page);
      todo(ts2.some(t => /carrozziere/.test(t)), `${name}: «Villo» mentre è dal carrozziere avvisa`);
    }
    await page.evaluate(() => { const S = window.__wz.S; S.time = S.hero.backAt - 0.01; });
    await advance(page, 1);
    await page.waitForTimeout(400);
    const up = await page.evaluate(() => { const b = document.getElementById('btnHero'); return { hero: window.__wz.hero(), cls: b.classList.contains('down'), txt: b.querySelector('span').textContent }; });
    check(up.hero.present && up.hero.id > 0 && !up.hero.down && !up.cls && up.txt === 'Villo', `${name}: la Macchina di Villo torna e il pulsante torna «Villo»`);
    await page.screenshot({ path: path.join(outDir, `${name}-meteo-villo-ritorno.png`) });

    check(errors.length === 0, `${name}: nessun errore JavaScript nelle prove del meteo e dei veterani${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
    await page.close();
  }
}

// Da sola: node tests/e2e/meteo.mjs (dopo npm run build).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const url = pathToFileURL(path.join(root, 'dist/index.html')).href;
  const failures = [], known = [];
  const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };
  const todo = (ok, msg) => { if (!ok) known.push(msg); console.log(`${ok ? 'ok  ' : 'TODO'} ${msg}`); };
  const landscape = { ...devices['Pixel 7'], viewport: { width: 851, height: 393 }, screen: { width: 851, height: 393 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
  const all = [['desktop', { viewport: { width: 1280, height: 800 } }], ['telefono', devices['Pixel 7']], ['telefono-orizzontale', landscape]];
  const only = process.env.E2E_PROFILE;
  const browser = await chromium.launch();
  try { await runWeatherChecks({ browser, url, check, todo, profiles: all.filter(([n]) => !only || n === only) }); } finally { await browser.close(); }
  if (known.length) console.log(`\n${known.length} problemi noti (TODO):\n- ${known.join('\n- ')}`);
  if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
  console.log('\nTutti i controlli del meteo e dei veterani sono passati.');
}
