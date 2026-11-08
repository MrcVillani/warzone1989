// Simulazione di bilanciamento della campagna «Operazione Valle Grigia».
// Un giocatore guidato dall'IA (autoplay) gioca le otto missioni in sequenza, con le ricerche e i progetti che avrebbe
// un giocatore reale a quel punto: dopo ogni missione si portano avanti quelli della vittoria più rappresentativa
// (la vinta con la durata più vicina alla mediana). Se una missione non viene mai vinta, si portano quelli della
// partita con più ricerche, come se fosse stata vinta, per poter provare le successive (lo segnala il riassunto).
//
//   node tests/balance/campagna.mjs
//
// Variabili d'ambiente:
//   N     partite per missione (predefinito 20)
//   DIFF  difficoltà: facile, normale, difficile (predefinito normale)
//   M     missioni da misurare, numeri da 1 a 8 separati da virgole (predefinito tutte); le missioni precedenti non
//         scelte si giocano solo fino alla prima vittoria (al massimo 4 partite), per avere le ricerche giuste
//   CAP   limite di una partita in minuti di gioco (predefinito 60): oltre, la partita conta come persa («limite»)
//   DT    passo di simulazione in secondi (predefinito 0.05, come nel gioco)
//   J     partite in parallelo (predefinito: numero di processori, al massimo 8)
//   V     1 = una riga per ogni partita
//
// Risultati in tests/balance/out/campagna-<diff>.json e riassunto a schermo.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ENGINE = new URL('../../engine/index.js', import.meta.url).href;

/* ---------- una partita (nel worker) ---------- */
async function workerMain() {
  const W = await import(ENGINE);
  const tierOf = o => { let t = 1; for (const T of W.TECH) if (W.S.tech[o][T.id]) t = Math.max(t, T.tier); return t; };
  parentPort.on('message', job => {
    const { camp, i, g, diff, cap, dt } = job;
    const orig = Math.random;
    Math.random = W.mulberry32((1000 * (i + 1) + g * 7919 + 17) >>> 0);
    let end = null, objEv = 0;
    const lostU = [0, 0];
    const off = W.onEvent((t, d) => {
      if (t === 'end') end = d;
      else if (t === 'objective') objEv++;
      else if (t === 'fx' && d.k === 'boom' && d.kind === 'unit') lostU[d.owner]++;
    });
    const t0 = Date.now();
    let res;
    try {
      W.startMission(camp, i, diff, { autoplay: true });
      const steps = Math.round(cap * 60 / dt), sampleEvery = Math.round(60 / dt);
      // ogni minuto: [minuto, pompe G, pompe N, mezzi armati G, mezzi armati N, gasolio G, gasolio N, ricerche G, ricerche N]
      const trace = [];
      const sample = () => {
        const S = W.S, c = [0, 0], a = [0, 0];
        for (const e of S.ents) { if (e.dead) continue; if (e.type === 'pump' && e.built >= 1) c[e.owner]++; else if (e.kind === 'unit' && !e.builder) a[e.owner]++; }
        return [+(S.time / 60).toFixed(1), c[0], c[1], a[0], a[1], Math.round(S.res[0]), Math.round(S.res[1]), Object.keys(S.tech[0]).length, Object.keys(S.tech[1]).length];
      };
      let maxArmy = [0, 0];
      for (let k = 0; k < steps && W.S.phase === 'play'; k++) {
        W.step(dt);
        if (k % 100 === 0) for (const o of [0, 1]) maxArmy[o] = Math.max(maxArmy[o], W.S.ents.filter(e => !e.dead && e.owner === o && e.kind === 'unit' && !e.builder).length);
        if (k % sampleEvery === 0) trace.push(sample());
      }
      trace.push(sample());
      const S = W.S;
      res = {
        g, won: S.phase === 'won', phase: S.phase, reason: end ? end.reason : 'limite', time: S.time,
        tierP: tierOf(0), tierE: tierOf(1), techP: Object.keys(S.tech[0]).length, techE: Object.keys(S.tech[1]).length,
        madeP: S.stats.made[0], madeE: S.stats.made[1], lostP: lostU[0], lostE: lostU[1], maxArmy, trace,
        wavesE: S.ai.wave, wavesP: S.aiP ? S.aiP.wave : 0, objText: S.objective && S.objective.text,
        objStage: S.objective && S.objective.stage, objEv, wall: (Date.now() - t0) / 1000,
        // quanto serve a finishMission
        carry: { phase: S.phase, mission: S.mission, time: S.time, tech: [S.tech[0], {}], designs: S.designs },
      };
    } catch (err) {
      res = { g, error: String(err && err.stack || err) };
    } finally { off(); Math.random = orig; }
    parentPort.postMessage(res);
  });
}

/* ---------- campagna (thread principale) ---------- */
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mins = s => s == null ? '–' : (s / 60).toFixed(1);

async function main() {
  const W = await import(ENGINE);
  const N = Math.max(1, +(process.env.N || 20));
  const diff = process.env.DIFF || 'normale';
  if (!W.DIFF[diff]) throw new Error(`Difficoltà sconosciuta: ${diff}`);
  const cap = +(process.env.CAP || 60), dt = +(process.env.DT || 0.05);
  const J = Math.max(1, +(process.env.J || Math.min(8, availableParallelism())));
  const pick = process.env.M ? new Set(process.env.M.split(',').map(s => +s.trim()).filter(n => n >= 1 && n <= W.MISSIONS.length)) : null;
  const last = pick ? Math.max(...pick) : W.MISSIONS.length;

  const workers = Array.from({ length: J }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { worker: true } }));
  let fail = null; for (const w of workers) w.on('error', e => { fail = e; console.error(e); process.exit(1); });
  const runGames = (camp, i, games) => new Promise((resolve, reject) => {
    const out = [], queue = [...games]; let busy = 0;
    const next = w => {
      if (!queue.length) { if (!busy) resolve(out.sort((a, b) => a.g - b.g)); return; }
      const g = queue.shift(); busy++;
      w.once('message', r => { busy--; out.push(r); if (process.env.V) line(i, r); next(w); });
      w.postMessage({ camp, i, g, diff, cap, dt });
    };
    for (const w of workers) next(w);
  });
  const line = (i, r) => console.log(r.error ? `  ${i + 1}#${r.g} ERRORE ${r.error}` :
    `  ${i + 1}#${r.g}: ${r.won ? 'vinta' : 'persa'} (${r.reason}) ${mins(r.time)} min · liv. G ${r.tierP} (${r.techP}) N ${r.tierE} (${r.techE}) · mezzi G ${r.madeP}/${r.lostP} N ${r.madeE}/${r.lostE} · ondate N ${r.wavesE} G ${r.wavesP} · «${r.objText}» · ${r.wall.toFixed(1)} s`);

  const started = Date.now();
  let camp = W.newCampaign();
  const report = { diff, N, cap, dt, date: new Date().toISOString(), missions: [] };
  for (let i = 0; i < last; i++) {
    const M = W.MISSIONS[i], measured = !pick || pick.has(i + 1);
    let res = [];
    if (measured) res = await runGames(camp, i, Array.from({ length: N }, (_, g) => g));
    else for (let g = 0; g < 4 && !res.some(r => r.won); g++) res.push(...await runGames(camp, i, [g]));
    const errors = res.filter(r => r.error);
    if (errors.length) { for (const r of errors) console.error(`Missione ${i + 1}, partita ${r.g}: ${r.error}`); process.exitCode = 1; }
    const ok = res.filter(r => !r.error), won = ok.filter(r => r.won), wt = won.map(r => r.time);
    // ricerche e progetti portati alla missione successiva
    let from, carriedFromLoss = false;
    if (won.length) { const md = median(wt); from = won.reduce((a, r) => Math.abs(r.time - md) < Math.abs(a.time - md) ? r : a); }
    else if (ok.length) { from = ok.reduce((a, r) => r.techP > a.techP ? r : a); carriedFromLoss = true; }
    const techBefore = Object.keys(camp.tech).length, carriedTech = Object.keys(camp.tech);
    if (from) camp = W.finishMission(camp, i, { ...from.carry, phase: 'won', mission: M.id });
    if (!measured) continue;
    const reasons = {};
    for (const r of ok.filter(r => !r.won)) reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    const m = {
      n: i + 1, id: M.id, name: M.name, objective: M.objective.type, maxTier: M.maxTier, games: ok.length,
      wins: won.length, winRate: ok.length ? won.length / ok.length : 0,
      won: { avg: avg(wt), median: median(wt), min: wt.length ? Math.min(...wt) : null, max: wt.length ? Math.max(...wt) : null },
      lostReasons: reasons,
      player: { tier: avg(ok.map(r => r.tierP)), tech: avg(ok.map(r => r.techP)), techCarried: techBefore, made: avg(ok.map(r => r.madeP)), lost: avg(ok.map(r => r.lostP)) },
      enemy: { tier: avg(ok.map(r => r.tierE)), tech: avg(ok.map(r => r.techE)), made: avg(ok.map(r => r.madeE)), lost: avg(ok.map(r => r.lostE)), waves: avg(ok.map(r => r.wavesE)) },
      carriedFromLoss, carriedFrom: from ? from.g : null, carriedTech,
      games_detail: ok.map(({ carry, ...r }) => r),
    };
    report.missions.push(m);
    console.log(`${m.n} ${m.name}: ${m.wins}/${m.games} vinte · vinte in ${mins(m.won.avg)} min (mediana ${mins(m.won.median)}, ${mins(m.won.min)}–${mins(m.won.max)}) · sconfitte ${JSON.stringify(reasons)}${carriedFromLoss ? ' · nessuna vittoria: ricerche portate da una sconfitta' : ''}`);
  }
  for (const w of workers) await w.terminate();
  report.wallSeconds = (Date.now() - started) / 1000;

  const dir = join(dirname(fileURLToPath(import.meta.url)), 'out');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `campagna-${diff}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));

  // riassunto
  const f1 = x => x == null ? '–' : x.toFixed(1);
  const rows = report.missions.map(m => [
    m.n, m.name, `${m.wins}/${m.games}`, mins(m.won.avg), mins(m.won.median), m.won.min == null ? '–' : `${mins(m.won.min)}–${mins(m.won.max)}`,
    (Object.entries(m.lostReasons).map(([k, v]) => `${k} ${v}`).join(', ') || '–') + (m.carriedFromLoss ? ' *' : ''),
    `${f1(m.player.tier)} (${f1(m.player.tech)}; ${m.player.techCarried} port.)`, `${f1(m.enemy.tier)} (${f1(m.enemy.tech)})`,
    `${f1(m.player.made)}/${f1(m.player.lost)}`, `${f1(m.enemy.made)}/${f1(m.enemy.lost)}`,
  ]);
  const head = ['#', 'Missione', 'Vinte', 'Media', 'Mediana', 'Min–max', 'Sconfitte', 'Giocatore liv. (ricerche)', 'Nemico liv. (ricerche)', 'Mezzi G prod./persi', 'Mezzi N prod./persi'];
  const wd = head.map((h, k) => Math.max(h.length, ...rows.map(r => String(r[k]).length)));
  const fmt = r => r.map((c, k) => String(c).padEnd(wd[k])).join('  ');
  console.log(`\nCampagna a «${diff}», ${N} partite per missione, limite ${cap} min, passo ${dt} s (durate in minuti di gioco delle partite vinte)`);
  console.log(fmt(head)); console.log(wd.map(n => '-'.repeat(n)).join('  '));
  for (const r of rows) console.log(fmt(r));
  if (report.missions.some(m => m.carriedFromLoss)) console.log('* nessuna vittoria: alla missione successiva si portano le ricerche della partita persa con più ricerche');
  console.log(`\nRisultati in ${file} · ${report.wallSeconds.toFixed(0)} s`);
}

if (isMainThread) await main();
else if (workerData && workerData.worker) await workerMain();
