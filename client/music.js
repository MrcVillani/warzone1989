// Colonna sonora originale, generata in tempo reale con Web Audio: nessun file, nessun tema preso da altre opere.
// Un orologio unico (72 battiti al minuto, 4/4, griglia di sedicesimi) pianifica le note con un piccolo anticipo sul
// tempo dell'AudioContext. Armonia in re minore con colore dorico (sol maggiore nel giro B), giri di 8 battute.
// Strati sullo stesso orologio e sullo stesso giro, mescolati con guadagni a rampa:
//   calma     tappeto d'archi, basso, corni (tema), coro lontano, arpa, timpani radi;
//   tensione  archi tesi in crome, battito di tamburo, sonaglio;
//   battaglia ostinato d'archi in semicrome, tamburi da guerra, rullante, colpi e tema eroico degli ottoni.
// Altri momenti: tema del menu (legni e corni su un giro proprio), frasi di vittoria, sconfitta e cambio di fase,
// «Valle liberata» (fine della campagna) e «Brigata sconfitta» (frase lunga, per l'album).
// Profili per missione (piano 06): ogni missione della campagna ha tonalità e modo, tempo, variante del tema,
// strumenti in primo piano e carattere della battaglia propri, ricavati dalla stessa materia; la schermaglia e il
// menu usano il materiale di base qui sotto, invariato.
// createMusic non dipende dal motore né dal DOM: lavora su qualunque contesto, anche OfflineAudioContext per le
// anteprime e per l'album (scripts/ost.mjs). In fondo il controllo dal vivo: impostazioni salvate, timer di
// pianificazione, pagina nascosta.

const BPM = 72, BEAT0 = 60 / BPM, STEP0 = BEAT0 / 4;
const LOOKAHEAD = 0.2, TICK_MS = 50, MAX_NOTES = 44, HOLD = 3;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

/* ---------- materiale musicale (composto per questo gioco) ---------- */
// Accordi: voci del tappeto d'archi in MIDI (condotte per grado congiunto) e nota del basso.
const CH = {
  Dm: { pad: [50, 57, 62, 65], bass: 38 },
  Bb: { pad: [50, 58, 62, 65], bass: 34 },
  F: { pad: [48, 57, 60, 65], bass: 41 },
  C: { pad: [48, 55, 60, 64], bass: 36 },
  Gm: { pad: [50, 58, 62, 67], bass: 43 },
  G: { pad: [50, 59, 62, 67], bass: 43 },
  Asus: { pad: [50, 57, 62, 64], bass: 33 },
  A: { pad: [49, 57, 61, 64], bass: 33 },
  DmA: { pad: [45, 57, 62, 65], bass: 33 },
  D: { pad: [50, 57, 62, 66], bass: 38 },
};
// Giri di 8 battute; una battuta divisa in due è [prima metà, seconda metà].
const PROG = {
  A: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', ['Asus', 'A']],
  B: ['Bb', 'C', 'Dm', 'G', 'Bb', 'F', 'Gm', ['Asus', 'A']],
  M: ['Dm', 'C', 'Bb', 'C', 'Dm', 'F', 'Gm', ['Asus', 'A']],
};
// Melodie: [nota MIDI, durata in battiti], 32 battiti per frase.
// A: tema dei corni, ad arco (sale fino al re acuto e si appoggia sul do diesis). B: sua risposta, con il si
// naturale del modo dorico. M: tema del menu, più cantabile.
const MEL = {
  A: [[69, 3], [67, 0.5], [65, 0.5], [62, 2], [65, 1], [70, 1], [69, 2], [72, 2], [67, 3], [64, 1],
    [65, 1.5], [64, 0.5], [62, 2], [70, 2], [69, 1], [67, 1], [65, 2], [70, 1], [72, 1], [74, 2], [73, 2]],
  B: [[74, 2], [72, 1], [70, 1], [67, 2], [72, 2], [69, 3], [65, 1], [71, 2], [74, 2],
    [74, 1.5], [72, 0.5], [70, 2], [69, 2], [72, 1], [69, 1], [67, 2], [70, 1], [69, 1], [69, 2], [64, 1], [69, 1]],
  M: [[74, 2], [69, 2], [67, 1], [64, 1], [67, 2], [65, 3], [62, 1], [64, 2], [67, 2],
    [69, 2], [74, 1], [72, 1], [69, 3], [65, 1], [67, 1], [70, 1], [74, 2], [76, 2], [73, 2]],
};
// Tema eroico: le stesse note con il ritmo puntato degli ottoni (ogni nota lunga riparte con un'anacrusi).
const heroic = mel => mel.flatMap(([m, d]) => d >= 2 ? [[m, 0.75], [m, 0.25], [m, d - 1]] : d === 1.5 ? [[m, 0.75], [m, 0.25], [m, 0.5]] : [[m, d]]);
// Indice per sedicesimo d'inizio, così la pianificazione trova subito la nota.
const byStep = mel => { const map = new Map(); let b = 0; for (const [m, d] of mel) { if (m != null) map.set(Math.round(b * 4), { m, d }); b += d; } return map; };
const MELS = { A: byStep(MEL.A), B: byStep(MEL.B), M: byStep(MEL.M), HA: byStep(heroic(MEL.A)), HB: byStep(heroic(MEL.B)) };
// Ostinato degli archi gravi (intervalli sulla fondamentale, una battuta di semicrome) e tamburi da guerra.
const OST = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 7, 7, 12, 7];
const DRUM = { 0: [1, 1], 3: [0, 0.55], 6: [1, 0.75], 8: [1, 0.95], 10: [0, 0.5], 11: [0, 0.6], 14: [1, 0.8] }; // [grande?, forza]
const arpNote = (c, i) => { const p = c.pad; return [p[0] + 12, p[1] + 12, p[2] + 12, p[3] + 12, p[2] + 24, p[3] + 12][i % 6]; };
const halves = cell => Array.isArray(cell) ? cell : [cell, cell];
const RIP = [0, 1, 2, 3, 4, 5, 4, 3, 2, 3, 4, 5, 4, 3, 2, 1];   // arpa «ad acqua»: sale e scende in semicrome
const FIN_BARS = 28;                                            // battute di «Valle liberata»
// Profilo di base (schermaglia e menu): il materiale qui sopra, così com'è.
const DEFAULT_PROFILE = {
  id: null, base: null, key: 're minore', bpm: BPM, CH, PROG: { A: PROG.A, B: PROG.B }, MELS: { A: MELS.A, B: MELS.B, HA: MELS.HA, HB: MELS.HB },
  lead: { A: 'horn', B: 'horn' }, second: {}, cfg: {}, tonicBass: 38,
};

/* ---------- profili per missione (piano 06) ----------
   Ogni profilo ricava la sua musica dallo stesso tema: le note del tema (scritte in re minore) diventano gradi della
   scala e si suonano nella tonalità e nel modo del profilo; le note alterate (il do diesis sensibile, il si naturale
   dorico) tengono la loro distanza dalla tonica. Gli accordi sono gradi («1», «6», «b7» abbassato, «5M» maggiore,
   «5s» quarta sospesa) disposti in automatico vicino alla posizione del tappeto di base. Tempo unico per tutti gli
   strati del profilo: calma, tensione e battaglia restano sullo stesso orologio. */
const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11], aeolian: [0, 2, 3, 5, 7, 8, 10],
};
const AEO = MODES.aeolian;
// Grado di una nota del tema (re minore, tonica 62): ottava, indice nella scala, semitoni se alterata.
function themeDeg(m) {
  const off = m - 62, oct = Math.floor(off / 12), pc = off - oct * 12, i = AEO.indexOf(pc);
  return i >= 0 ? { oct, i, alt: null } : { oct, i: AEO.indexOf(pc - 1), alt: pc };
}
const inKey = (m, K) => { const d = themeDeg(m); return K.tonic + d.oct * 12 + (d.alt != null ? d.alt : K.scale[d.i]); };
// Varianti ritmiche del tema (lavorano sulle note in re minore; null è una pausa).
const breathe = mel => mel.flatMap(([m, d]) => d >= 2 ? [[m, d - 1], [null, 1]] : [[m, d]]);            // frasi che si fermano ad ascoltare
const pulse = mel => mel.flatMap(([m, d]) => d >= 2 && d % 1 === 0 ? Array.from({ length: d }, () => [m, 1]) : [[m, d]]); // note lunghe ribattute
const march = mel => mel.flatMap(([m, d]) => d === 3 ? [[m, 1], [m, 0.5], [m, 0.5], [m, 1]] : d === 2 ? [[m, 0.5], [m, 0.5], [m, 1]] : [[m, d]]);
const broad = mel => { const o = []; for (const [m, d] of mel) { if (d < 1 && o.length) o[o.length - 1][1] += d; else o.push([m, d]); } return o; }; // senza note di passaggio
function chordSpec(spec, K) {
  const [, flat, dg, q] = /^(b?)([1-7])([Mms]?)$/.exec(spec), i = dg - 1, sc = K.scale;
  const iv = q === 'M' || (flat && !q) ? [0, 4, 7] : q === 'm' ? [0, 3, 7] : q === 's' ? [0, 5, 7]
    : [0, (sc[(i + 2) % 7] - sc[i] + 12) % 12, (sc[(i + 4) % 7] - sc[i] + 12) % 12];
  const root = (K.tonic + sc[i] - (flat ? 1 : 0)) % 12;
  return { root, pcs: iv.map(x => (root + x) % 12), dim: iv[2] === 6 };
}
// Posizione del tappeto: quattro voci in ordine, tutte le note dell'accordo, il più vicino possibile al tappeto di base.
const REF = [50, 57, 62, 65];
function voicing(pcs) {
  const cand = []; for (let m = 46; m <= 69; m++) if (pcs.includes(m % 12)) cand.push(m);
  let best = null, bs = 1e9;
  for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) for (let c = b + 1; c < cand.length; c++) for (let d = c + 1; d < cand.length; d++) {
    const v = [cand[a], cand[b], cand[c], cand[d]];
    if (v[1] - v[0] > 12 || v[2] - v[1] > 9 || v[3] - v[2] > 9 || !pcs.every(p => v.some(x => x % 12 === p))) continue;
    const sc = v.reduce((s, x, k) => s + Math.abs(x - REF[k]), 0);
    if (sc < bs) { bs = sc; best = v; }
  }
  return best;
}
const cellAt = (prog, beat) => { const c = prog[Math.floor(beat / 4) & 7]; return Array.isArray(c) ? c[(beat % 4) >= 2 ? 1 : 0] : c; };
// Le note lunghe che cadono a un semitono da una nota dell'accordo vi si appoggiano (niente seconde minori sui tempi).
function fit(mel, prog, CHP) {
  let b = 0;
  return mel.map(([m, d]) => {
    const on = b; b += d;
    if (m == null || (d < 1 && on % 1 !== 0)) return [m, d];
    const pcs = CHP[cellAt(prog, on)].pcs, pc = ((m % 12) + 12) % 12;
    if (pcs.includes(pc)) return [m, d];
    for (const k of [1, -1]) if (pcs.includes((pc + k + 12) % 12) && !pcs.includes((pc - k + 12) % 12)) return [m + k, d];
    return [m, d];
  });
}
// Seconda voce sulle note dell'accordo: 'below' armonizza sotto (terze e seste), 'under'/'over' va per moto
// contrario sotto o sopra la melodia. Le note brevi fuori dal battito allungano la nota precedente.
function voice2(mel, prog, CHP, how) {
  const out = []; let b = 0, cur = null, prev = null;
  const SC = { 3: 0, 4: 0, 8: 1, 9: 1, 7: 2, 5: 3, 12: 4 };
  for (const [m, d] of mel) {
    const on = b; b += d;
    if (m == null) { out.push([null, d]); continue; }
    if (on % 1 !== 0 && out.length && out[out.length - 1][0] != null) { out[out.length - 1][1] += d; prev = m; continue; }
    const pcs = CHP[cellAt(prog, on)].pcs, up = how === 'over';
    const cands = []; for (let k = 3; k <= (how === 'below' ? 12 : 16); k++) { const x = up ? m + k : m - k; if (pcs.includes(((x % 12) + 12) % 12)) cands.push(x); }
    const near = tg => cands.reduce((a, x) => Math.abs(x - tg) < Math.abs(a - tg) ? x : a, cands[0]);
    let pick;
    if (!cands.length) pick = null;
    else if (how === 'below') pick = cands.reduce((a, x) => (SC[m - x] ?? 5) < (SC[m - a] ?? 5) ? x : a, cands[0]);
    else if (cur == null || prev == null) pick = near(up ? m + 7 : m - 9);
    else {
      const dir = Math.sign(m - prev), lower = cands.filter(x => x < cur), higher = cands.filter(x => x > cur);
      pick = dir > 0 ? (lower.length ? Math.max(...lower) : near(cur)) : dir < 0 ? (higher.length ? Math.min(...higher) : near(cur)) : (cands.includes(cur) ? cur : near(cur));
    }
    out.push([pick, d]); cur = pick ?? cur; prev = m;
  }
  return out;
}

// Disegni ritmici della battaglia: ostinato (intervalli sulla fondamentale, null = pausa) e tamburi [grande?, forza].
const OSTS = {
  night: [0, null, null, null, 0, null, 12, null, 0, null, null, null, 7, null, 0, null],
  w332: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 7, 7],
  drive: [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 7, 12, 7, 12],
  heavy: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, 7, null, 12, null],
  wave: [0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 7, 0, 7, 12, 19],
};
const DRUMS = {
  night: { 0: [1, 0.8], 8: [1, 0.6], 14: [0, 0.4] },
  w332: { 0: [1, 1], 3: [0, 0.5], 6: [1, 0.8], 8: [1, 0.9], 11: [0, 0.55], 14: [0, 0.7] },
  drive: { 0: [1, 1], 2: [0, 0.45], 4: [0, 0.55], 6: [1, 0.8], 8: [1, 0.95], 10: [0, 0.45], 12: [0, 0.6], 14: [1, 0.8], 15: [0, 0.5] },
  heavy: { 0: [1, 1], 6: [1, 0.6], 8: [1, 1], 14: [0, 0.6] },
  epic: { 0: [1, 1], 2: [1, 0.6], 3: [0, 0.55], 6: [1, 0.75], 8: [1, 1], 10: [0, 0.5], 11: [0, 0.6], 12: [1, 0.7], 14: [1, 0.8] },
};
const PA = ['1', '6', '3', '7', '1', '4', '6', ['5s', '5M']];            // giro A del tema, per gradi
const PB = ['6', '7', '1', '4M', '6', '3', '4', ['5s', '5M']];           // giro B
const PA_MAJ = ['1', '6', '3', 'b7', '1', '4', '6', ['5s', '5M']];       // nei modi maggiori: settimo grado abbassato
const PB_MAJ = ['6', '5', '1', '4M', '6', '3', '4', ['5s', '5M']];
// Profili: key (descrizione), tonica (MIDI, nell'ottava del tema), modo, tempo, giri, varianti del tema (A e B),
// strumento e ottava della melodia, seconda voce, colore della calma (cfg) e carattere della battaglia (cfg.bat).
const SPECS = {
  'testa-di-ponte': {
    key: 'si minore', tonic: 59, mode: 'aeolian', bpm: 64, prog: { A: PA, B: PB },
    mel: { A: breathe(MEL.A), B: breathe(MEL.B) }, lead: { A: ['reed', 0], B: ['horn', -12] },
    cfg: { bright: 0.6, padLvl: 0.9, harp: 'sparse', choir: 'none',
      bat: { ost: 'night', drum: 'night', hi: false, snare: 'light', stabs: 'few', lead: -12, leadVel: 0.8 } },
  },
  'pozzi-del-guado': {
    key: 'mi frigio', tonic: 64, mode: 'phrygian', bpm: 70, prog: { A: ['1', '6', '3', '2', '1', '4', '6', ['5s', '5M']], B: PB },
    mel: { A: pulse(MEL.A), B: MEL.B }, lead: { A: ['horn', -12], B: ['reed', 0] },
    cfg: { bright: 0.75, harp: 'sparse', timp: 'pedal',
      bat: { ost: 'w332', drum: 'w332', snare: 'half', lead: -12 } },
  },
  'colonna-rifornimenti': {
    key: 'sol minore', tonic: 55, mode: 'aeolian', bpm: 96, prog: { A: PA, B: PB },
    mel: { A: march(MEL.A), B: march(MEL.B) }, lead: { A: ['reed', 12], B: ['horn', 0] },
    cfg: { bright: 0.9, pulse: true, choir: 'none', timp: 'roll',
      bat: { ost: 'drive', drum: 'drive', snare: 'march', lead: 0 } },
  },
  'passo-dei-larici': {
    key: 'mi bemolle maggiore', tonic: 63, mode: 'ionian', bpm: 60, prog: { A: PA_MAJ, B: PB_MAJ },
    mel: { A: broad(MEL.A), B: broad(MEL.B) }, lead: { A: ['horn', 0], B: ['horn', 0] }, second: { A: ['horn2', 'below'], B: ['horn2', 'below'] },
    cfg: { bright: 0.85, harp: 'none', choir: 'full', bell: true, timp: 'roll',
      bat: { ost: 'heavy', drum: 'heavy', snare: 'half', timp: 'every', lead: 0, choir: true } },
  },
  'diga-serra-alta': {
    key: 'do lidio', tonic: 60, mode: 'lydian', bpm: 68,
    prog: { A: ['1', '6', '3', '7', '1', '2M', '6', ['5s', '5M']], B: ['6', '7', '1', '2M', '6', '3', '2M', ['5s', '5M']] },
    mel: { A: MEL.A, B: MEL.B }, lead: { A: ['reed', 12], B: ['horn', 0] },
    cfg: { bright: 1.1, harp: 'ripple',
      bat: { ost: 'wave', stabs: 'few', crash4: true, lead: 0 } },
  },
  'due-fuochi': {
    key: 'fa diesis minore', tonic: 66, mode: 'aeolian', bpm: 84, prog: { A: PA, B: PB },
    mel: { A: MEL.A, B: MEL.B }, lead: { A: ['reed', 0], B: ['horn', -12] }, second: { A: ['horn2', 'under'], B: ['reed2', 'over'] },
    cfg: { bright: 0.95,
      bat: { lead: 0, counter: true } },
  },
  'contrattacco': {
    key: 'la minore', tonic: 57, mode: 'aeolian', bpm: 80, prog: { A: PA, B: PB },
    mel: { A: broad(MEL.A), B: breathe(MEL.B) }, lead: { A: ['horn', 0], B: ['horn', 0] }, second: { B: ['horn2', 'below'] },
    cfg: { bright: 0.55, harp: 'none', choir: 'none', timp: 'pedal',
      bat: { drum: 'heavy', snare: 'half', stabs: 'few', lead: 0, leadVel: 0.85 } },
  },
  // seconda parte di «Contrattacco» (obiettivo alla fase 2): stessa tonica e stesso tempo, in maggiore e trionfale
  'contrattacco/2': {
    key: 'la maggiore', tonic: 57, mode: 'ionian', bpm: 80, prog: { A: PA_MAJ, B: PB_MAJ },
    mel: { A: MEL.A, B: MEL.B }, lead: { A: ['horn', 0], B: ['horn', 0] }, second: { A: ['horn2', 'below'], B: ['horn2', 'below'] },
    cfg: { bright: 1.15, choir: 'full', timp: 'roll',
      bat: { drum: 'epic', timp: 'every', crash4: true, lead: 0, choir: true } },
  },
  'comando-direttorio': {
    key: 're minore', tonic: 62, mode: 'aeolian', bpm: 88, prog: { A: PA, B: PB },
    mel: { A: heroic(MEL.A), B: heroic(MEL.B) }, lead: { A: ['horn', 0], B: ['horn', 0] }, second: { A: ['horn2', 'below'] },
    cfg: { bright: 1.05, choir: 'full', timp: 'roll',
      bat: { drum: 'epic', stabs: 'many', timp: 'every', crash4: true, lead: 0, low: true, choir: true } },
  },
  // fine della campagna (non è una missione): la frase «Valle liberata» usa questo profilo
  'valle-liberata': {
    key: 're maggiore', tonic: 62, mode: 'ionian', bpm: 80, prog: { A: PA_MAJ, B: PB_MAJ },
    mel: { A: MEL.A, B: MEL.B }, lead: { A: ['reed', 0], B: ['horn', 0] }, second: { B: ['horn2', 'below'] }, extra: ['b6'],
    cfg: { bright: 1.1 },
  },
};
function compile(id) {
  const sp = SPECS[id], K = { tonic: sp.tonic, scale: MODES[sp.mode] }, CHP = {};
  for (const c of [...sp.prog.A, ...sp.prog.B, ...(sp.extra || [])].flatMap(halves)) if (!CHP[c]) {
    const x = chordSpec(c, K); let b = 33; while (b % 12 !== x.root) b++;
    CHP[c] = { pad: voicing(x.pcs), bass: b, pcs: x.pcs, dim: x.dim };
  }
  const MS = {}, raw = {};
  for (const kind of ['A', 'B']) {
    const prog = sp.prog[kind], [inst, oc] = sp.lead[kind];
    const mel = fit(sp.mel[kind].map(([m, d]) => [m == null ? null : inKey(m, K) + oc, d]), prog, CHP);
    const hero = fit(heroic(MEL[kind]).map(([m, d]) => [inKey(m, K) + (sp.cfg.bat?.lead ?? 0), d]), prog, CHP);
    raw[kind] = mel; raw['H' + kind] = hero;
    MS[kind] = byStep(mel); MS['H' + kind] = byStep(hero);
    const s2 = sp.second && sp.second[kind];
    if (s2) { const v = voice2(mel, prog, CHP, s2[1]); raw['S' + kind] = v; MS['S' + kind] = byStep(v); }
    if (sp.cfg.bat?.counter) { const v = voice2(hero, prog, CHP, 'under'); raw['K' + kind] = v; MS['K' + kind] = byStep(v); }
    if (sp.cfg.bat?.low) { const v = hero.map(([m, d]) => [m == null ? null : m - 12, d]); MS['L' + kind] = byStep(v); }
  }
  return {
    id, base: id.split('/')[0], key: sp.key, bpm: sp.bpm, CH: CHP, PROG: { A: sp.prog.A, B: sp.prog.B }, MELS: MS, raw,
    lead: { A: sp.lead.A[0], B: sp.lead.B[0] }, second: { A: sp.second?.A?.[0], B: sp.second?.B?.[0] }, cfg: sp.cfg, tonicBass: CHP['1'] ? CHP['1'].bass : 38,
  };
}
const compiled = {};
// Profilo compilato per id (missione, 'contrattacco/2', 'valle-liberata'); quello di base per id sconosciuti o null.
export function musicProfile(id) {
  if (!id || !SPECS[id]) return DEFAULT_PROFILE;
  return compiled[id] || (compiled[id] = compile(id));
}
export const MUSIC_PROFILES = Object.keys(SPECS);

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Risposta all'impulso del riverbero: rumore stereo che decade (−60 dB alla fine) e si scurisce nel tempo.
function impulse(ctx, secs, rnd) {
  const sr = ctx.sampleRate, n = Math.floor(sr * secs), pre = Math.floor(sr * 0.018), b = ctx.createBuffer(2, n, sr);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c); let lp = 0;
    for (let i = pre; i < n; i++) {
      const x = (i - pre) / (n - pre), a = 0.2 + 0.7 * x;
      lp = a * lp + (1 - a) * (rnd() * 2 - 1);
      d[i] = lp * Math.exp(-6.9 * x) * (1 + 0.6 * a);
    }
    // energia unitaria: il riverbero non alza il livello, lo spande
    let e = 0; for (let i = 0; i < n; i++) e += d[i] * d[i];
    const k = 1 / Math.sqrt(e || 1); for (let i = 0; i < n; i++) d[i] *= k;
  }
  return b;
}

/* ---------- motore musicale ---------- */
// ctx: AudioContext o OfflineAudioContext; dest: nodo d'uscita. opts.volume (0–1), opts.seed (variazioni ripetibili).
export function createMusic(ctx, dest, opts = {}) {
  const rnd = rng(opts.seed ?? (Math.random() * 4294967296));
  const holdAt = (p, t) => { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t); else p.cancelScheduledValues(t); };

  // Catena d'uscita: miscela → compressore leggero → limitatore → abbassamento (ducking) → volume → destinazione.
  const out = ctx.createGain(); out.gain.value = opts.volume ?? 0.5;
  const duckG = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.knee.value = 8; comp.ratio.value = 2.5; comp.attack.value = 0.01; comp.release.value = 0.25;
  const mix = ctx.createGain(); mix.gain.value = 0.5;
  // limitatore veloce: tiene sotto controllo i colpi che cadono insieme sul battere (tamburi, ottoni, archi)
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -7; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
  if (opts.compress === false) mix.connect(duckG); else { mix.connect(comp); comp.connect(lim); lim.connect(duckG); }
  duckG.connect(out); out.connect(dest);
  const verb = ctx.createConvolver(); verb.normalize = false; verb.buffer = impulse(ctx, 2.6, rnd);
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55; verb.connect(verbOut); verbOut.connect(mix);
  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  { const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = rnd() * 2 - 1; }

  // Sezione (menu o partita): un doppio guadagno, asciutto e verso il riverbero, per sfumarla tutta insieme.
  const sec = { dry: ctx.createGain(), wet: ctx.createGain(), ramp: { t0: 0, v0: 1, t1: 0, v1: 1 } };
  sec.dry.connect(mix); sec.wet.connect(verb);
  // Strati: livello con rampa, bus per strumento (asciutto + mandata al riverbero, panorama, filtro).
  function layer(name, inSec, v = 0) {
    const L = { name, sec: inSec, dry: ctx.createGain(), wet: ctx.createGain(), ramp: { t0: 0, v0: v, t1: 0, v1: v }, buses: {} };
    L.dry.gain.value = v; L.wet.gain.value = v;
    L.dry.connect(inSec ? sec.dry : mix); L.wet.connect(inSec ? sec.wet : verb);
    return L;
  }
  const LY = { calm: layer('calm', true, 1), mel: layer('mel', true, 1), ten: layer('ten', true), bat: layer('bat', true), st: layer('st', false, 1) };
  // solo per le misure: strati da tenere muti (opts.mute = ['calm', ...])
  for (const k of opts.mute || []) { LY[k].dry.disconnect(); LY[k].wet.disconnect(); }
  function bus(L, name, o = {}) {
    let b = L.buses[name]; if (b) return b;
    b = ctx.createGain(); b.gain.value = o.gain ?? 1;
    let tail = b;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q ?? 0.7; tail.connect(f); tail = f; }
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; tail.connect(p); tail = p; }
    const d = ctx.createGain(); d.gain.value = o.dry ?? 1; tail.connect(d);
    const s = ctx.createGain(); s.gain.value = o.send ?? 0.3; tail.connect(s);
    if (!opts.solo || opts.solo === name) { d.connect(L.dry); s.connect(L.wet); }   // solo: misure di bilanciamento
    return (L.buses[name] = b);
  }
  const levelAt = (R, t) => t <= R.t0 ? R.v0 : t >= R.t1 ? R.v1 : R.v0 + (R.v1 - R.v0) * (t - R.t0) / (R.t1 - R.t0);
  function setLevel(L, v, t, dur) {
    const cur = levelAt(L.ramp, t);
    for (const p of [L.dry.gain, L.wet.gain]) { holdAt(p, t); p.setValueAtTime(cur, t); p.linearRampToValueAtTime(v, t + dur); }
    L.ramp = { t0: t, v0: cur, t1: t + dur, v1: v };
  }
  const audible = (L, t) => L.ramp.v1 > 0.01 || levelAt(L.ramp, t) > 0.01;

  /* ---------- mattoni di sintesi ---------- */
  const live = [];   // sorgenti della sezione in corso: si fermano quando la sezione cambia
  const notes = [];  // istanti di fine delle note, per il limite di voci
  const stats = { notes: 0, dropped: 0 };
  function admit(t, end, prio) {
    let j = 0; for (const e of notes) if (e > t) notes[j++] = e; notes.length = j;
    if (notes.length >= MAX_NOTES && !prio) { stats.dropped++; return false; }
    notes.push(end); stats.notes++; return true;
  }
  function osc(L, type, f, t, end) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(end);
    if (L.sec) live.push({ s: o, end });
    return o;
  }
  function noiseSrc(L, t, end) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, rnd() * 1.5); s.stop(end);
    if (L.sec) live.push({ s, end });
    return s;
  }
  const gainN = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const filt = (type, f, q = 0.7) => { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; };
  // Inviluppo morbido: sale fino a peak, resta, scende linearmente a zero tra r0 e r1.
  function env(t, a, peak, r0, r1) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, Math.max(t + a, r0)); g.gain.linearRampToValueAtTime(0, Math.max(t + a + 0.01, r1)); return g;
  }
  // Inviluppo percussivo: attacco brevissimo, discesa esponenziale.
  function perc(t, peak, dec, a = 0.003) {
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); return g;
  }
  // A fine nota scollega i nodi intermedi (le sorgenti ferme si liberano da sole).
  const done = (src, nodes) => { src.onended = () => { for (const n of nodes) { try { n.disconnect(); } catch (e) { /* già scollegato */ } } }; };

  /* ---------- strumenti ---------- */
  // Tappeto d'archi: quattro voci, due seghe disaccordate per voce (una a sinistra, una a destra), passa-basso lento.
  function pad(L, c, t, dur, bright = 1, lvl = 1) {
    const end = t + dur + 1.1; if (!admit(t, end, true)) return;
    for (const side of [0, 1]) {
      const f = filt('lowpass', 600 * bright, 0.6);
      f.frequency.setValueAtTime(520 * bright, t); f.frequency.linearRampToValueAtTime(1250 * bright, t + dur * 0.55); f.frequency.linearRampToValueAtTime(700 * bright, end);
      const g = env(t, 0.6, 0.06 * lvl, t + dur, end); f.connect(g);
      g.connect(bus(L, side ? 'padR' : 'padL', { pan: side ? 0.55 : -0.55, send: 0.5 }));
      let o; for (const m of c.pad) { o = osc(L, 'sawtooth', mtof(m) * (side ? 1.0035 : 0.9965), t, end); o.connect(f); }
      done(o, [f, g]);
    }
  }
  // Contrabbassi: sega e sinusoide sulla fondamentale, molto scuri.
  function bass(L, c, t, dur, lvl = 1) {
    const end = t + dur + 0.8, f0 = mtof(c.bass); if (!admit(t, end, true)) return;
    const f = filt('lowpass', 300, 0.8), g = env(t, 0.25, 0.042 * lvl, t + dur, end);
    const a = osc(L, 'sawtooth', f0, t, end), b = osc(L, 'sine', f0, t, end), bg = gainN(0.6);
    a.connect(f); b.connect(bg); bg.connect(f); f.connect(g); g.connect(bus(L, 'bass', { send: 0.15 }));
    done(a, [f, g, bg]);
  }
  // Vibrato che entra piano: un'oscillazione lenta sulla frequenza di una o più sorgenti.
  function vibrato(L, oscs, f0, t, end, rate, depth, delay) {
    const v = osc(L, 'sine', rate, t, end), vg = ctx.createGain();
    vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(f0 * depth, t + delay);
    v.connect(vg); for (const o of oscs) vg.connect(o.frequency);
    return [vg];
  }
  // Corno: sega e triangolo filtrati, attacco morbido che si apre, vibrato ritardato.
  function horn(L, m, t, dur, vel = 1, name = 'horn', pan = -0.15) {
    const end = t + dur + 0.35, f0 = mtof(m); if (!admit(t, end, true)) return;
    const a = osc(L, 'sawtooth', f0, t, end), b = osc(L, 'triangle', f0 * 1.002, t, end);
    const f = filt('lowpass', 400, 0.9);
    f.frequency.setValueAtTime(350, t); f.frequency.linearRampToValueAtTime(1500, t + 0.18); f.frequency.linearRampToValueAtTime(1050, t + 0.6); f.frequency.linearRampToValueAtTime(500, end);
    const bg = gainN(0.8), g = env(t, 0.16, 0.14 * vel, t + dur, end);
    a.connect(f); b.connect(bg); bg.connect(f); f.connect(g); g.connect(bus(L, name, { send: 0.6, pan }));
    const vn = vibrato(L, [a, b], f0, t, end, 4.8 + rnd() * 0.6, 0.005, Math.min(dur, 0.8));
    done(a, [f, g, bg, ...vn]);
  }
  // Legni (tema del menu): triangolo con un filo di seconda armonica, vibrato leggero.
  function reed(L, m, t, dur, vel = 1, name = 'reed', pan = 0.2) {
    const end = t + dur + 0.3, f0 = mtof(m); if (!admit(t, end, true)) return;
    const a = osc(L, 'triangle', f0, t, end), b = osc(L, 'sine', f0 * 2, t, end), bg = gainN(0.12);
    const f = filt('lowpass', 2600, 0.5), g = env(t, 0.12, 0.17 * vel, t + dur, end);
    a.connect(f); b.connect(bg); bg.connect(f); f.connect(g); g.connect(bus(L, name, { send: 0.65, pan }));
    const vn = vibrato(L, [a, b], f0, t, end, 5.2, 0.004, Math.min(dur, 0.6));
    done(a, [f, g, bg, ...vn]);
  }
  // Ottoni del tema eroico: tre seghe disaccordate più un'ottava sotto, filtro che si apre all'attacco.
  function brass(L, m, t, dur, vel = 1, name = 'brass', pan = 0.12) {
    const end = t + dur + 0.25, f0 = mtof(m); if (!admit(t, end, true)) return;
    const f = filt('lowpass', 600, 1.2);
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2700, t + 0.05); f.frequency.linearRampToValueAtTime(1500, t + 0.4); f.frequency.linearRampToValueAtTime(600, end);
    const g = env(t, 0.035, 0.14 * vel, t + dur, end), lo = gainN(0.55);
    const os = [0.996, 1, 1.004].map(k => { const o = osc(L, 'sawtooth', f0 * k, t, end); o.connect(f); return o; });
    const o2 = osc(L, 'sawtooth', f0 / 2, t, end); o2.connect(lo); lo.connect(f);
    f.connect(g); g.connect(bus(L, name, { send: 0.35, pan }));
    const vn = vibrato(L, os, f0, t, end, 5.5, 0.0035, Math.min(dur, 0.5));
    done(os[0], [f, g, lo, ...vn]);
  }
  // Colpo d'ottoni sull'accordo: attacco secco e filtro che si chiude subito.
  function stab(L, c, t, vel = 1) {
    const end = t + 0.6; if (!admit(t, end, true)) return;
    const f = filt('lowpass', 500, 1.1);
    f.frequency.setValueAtTime(400, t); f.frequency.linearRampToValueAtTime(3200, t + 0.02); f.frequency.exponentialRampToValueAtTime(650, t + 0.4);
    const g = perc(t, 0.15 * vel, 0.5, 0.008); f.connect(g); g.connect(bus(L, 'stab', { send: 0.4, pan: -0.1 }));
    let o; for (const m of c.pad) for (const k of [0.995, 1.005]) { o = osc(L, 'sawtooth', mtof(m) * k, t, end); o.connect(f); }
    done(o, [f, g]);
  }
  // Coro lontano: seghe attraverso due filtri a formanti che passano dalla «o» alla «a» e tornano.
  function choir(L, c, t, dur, lvl = 1) {
    const end = t + dur + 1.2; if (!admit(t, end, false)) return;
    const p = c.pad, ms = [p[2], p[3], p[1] + 12];
    const f1 = filt('bandpass', 450, 6), f2 = filt('bandpass', 800, 9), g2 = gainN(0.55);
    f1.frequency.setValueAtTime(450, t); f1.frequency.linearRampToValueAtTime(780, t + dur * 0.5); f1.frequency.linearRampToValueAtTime(480, end);
    f2.frequency.setValueAtTime(820, t); f2.frequency.linearRampToValueAtTime(1180, t + dur * 0.5); f2.frequency.linearRampToValueAtTime(840, end);
    const g = env(t, 0.9, 0.45 * lvl, t + dur, end); f1.connect(g); f2.connect(g2); g2.connect(g);
    g.connect(bus(L, 'choir', { send: 1, dry: 0.3, pan: 0.3 }));
    const v = osc(L, 'sine', 4.6, t, end), extra = [g2];
    let o; for (const m of ms) {
      const f0 = mtof(m) * (1 + (rnd() - 0.5) * 0.006); o = osc(L, 'sawtooth', f0, t, end); o.connect(f1); o.connect(f2);
      const vg = gainN(f0 * 0.006); v.connect(vg); vg.connect(o.frequency); extra.push(vg);
    }
    done(o, [f1, f2, g, ...extra]);
  }
  // Arpa: triangolo con seconda armonica, pizzico che si spegne.
  function harp(L, m, t, vel = 1) {
    const end = t + 1.7; if (!admit(t, end, false)) return;
    const f0 = mtof(m), g = perc(t, 0.16 * vel, 1.6, 0.002), hg = gainN(0.25);
    const a = osc(L, 'triangle', f0, t, end), b = osc(L, 'sine', f0 * 2, t, end);
    a.connect(g); b.connect(hg); hg.connect(g); g.connect(bus(L, 'harp', { send: 0.55, pan: 0.35 }));
    done(a, [g, hg]);
  }
  // Timpano: sinusoide che si assesta sull'intonazione, parziale a 1,5 e colpo di pelle.
  function timp(L, m, t, vel = 1, dec = 1.6) {
    const end = t + dec + 0.1; if (!admit(t, end, true)) return;
    let f0 = mtof(m); while (f0 > 120) f0 /= 2; while (f0 < 60) f0 *= 2;
    const g = perc(t, 0.3 * vel, dec), pg = gainN(0.22), ng = perc(t, 0.25 * vel, 0.08), nf = filt('lowpass', 220, 0.7);
    const a = osc(L, 'sine', f0 * 1.05, t, end); a.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
    const b = osc(L, 'sine', f0 * 1.5, t, end), n = noiseSrc(L, t, t + 0.12);
    a.connect(g); b.connect(pg); pg.connect(g); n.connect(nf); nf.connect(ng);
    const B = bus(L, 'timp', { send: 0.45 }); g.connect(B); ng.connect(B);
    done(a, [g, pg, ng, nf]);
  }
  // Tamburo da guerra (grande) o tamburo medio: sinusoide con discesa di altezza più rumore.
  function drum(L, t, vel, big) {
    const dec = big ? 0.7 : 0.35, end = t + dec + 0.05; if (!admit(t, end, true)) return;
    const g = perc(t, (big ? 0.38 : 0.26) * vel, dec);
    const a = osc(L, 'sine', big ? 105 : 175, t, end); a.frequency.exponentialRampToValueAtTime(big ? 46 : 105, t + dec * 0.6);
    const n = noiseSrc(L, t, t + 0.14), nf = filt(big ? 'lowpass' : 'bandpass', big ? 700 : 950, big ? 0.7 : 1.2), ng = perc(t, (big ? 0.25 : 0.22) * vel, big ? 0.12 : 0.08);
    nf.frequency.setValueAtTime(big ? 700 : 950, t); nf.frequency.exponentialRampToValueAtTime(big ? 160 : 500, t + 0.12);
    a.connect(g); n.connect(nf); nf.connect(ng);
    const B = bus(L, 'drums', { send: 0.25 }); g.connect(B); ng.connect(B);
    done(a, [g, nf, ng]);
  }
  function snare(L, t, vel) {
    const end = t + 0.25; if (!admit(t, end, false)) return;
    const n = noiseSrc(L, t, end), f = filt('bandpass', 1900, 0.7), g = perc(t, 0.7 * vel, 0.2, 0.002);
    const a = osc(L, 'triangle', 205, t, t + 0.12), ag = perc(t, 0.5 * vel, 0.09, 0.002); a.frequency.exponentialRampToValueAtTime(170, t + 0.08);
    n.connect(f); f.connect(g); a.connect(ag);
    const B = bus(L, 'snare', { send: 0.3, pan: -0.12 }); g.connect(B); ag.connect(B);
    done(n, [f, g, ag]);
  }
  function shaker(L, t, vel) {
    const end = t + 0.08; if (!admit(t, end, false)) return;
    const n = noiseSrc(L, t, end), f = filt('highpass', 6500, 0.7), g = perc(t, 0.6 * vel, 0.05, 0.008);
    n.connect(f); f.connect(g); g.connect(bus(L, 'shaker', { send: 0.2, pan: 0.3 }));
    done(n, [f, g]);
  }
  function crash(L, t, vel, dec = 2.4) {
    const end = t + dec + 0.05; if (!admit(t, end, true)) return;
    const n = noiseSrc(L, t, end), f = filt('highpass', 4200, 0.6), f2 = filt('peaking', 7500, 1.5), g = perc(t, 0.5 * vel, dec, 0.004);
    f2.gain.value = 5; n.connect(f); f.connect(f2); f2.connect(g); g.connect(bus(L, 'cym', { send: 0.35, pan: -0.2 }));
    done(n, [f, f2, g]);
  }
  // Piatto in crescendo (rullo che sale) fino a t1.
  function swell(L, t0, t1, vel) {
    const n = noiseSrc(L, t0, t1 + 0.03), f = filt('highpass', 3500, 0.7), g = ctx.createGain();
    f.frequency.setValueAtTime(2500, t0); f.frequency.exponentialRampToValueAtTime(6000, t1);
    g.gain.setValueAtTime(0.0005, t0); g.gain.exponentialRampToValueAtTime(0.3 * vel, t1); g.gain.linearRampToValueAtTime(0, t1 + 0.03);
    n.connect(f); f.connect(g); g.connect(bus(L, 'cym', { send: 0.35, pan: -0.2 }));
    done(n, [f, g]);
  }
  // Archi in ostinato: note brevi e accentate (gravi o acuti), filtrate dal bus.
  function ost(L, m, t, vel, hi) {
    const len = hi ? STEP * 1.7 : STEP * 0.95, end = t + len + 0.02; if (!admit(t, end, !hi)) return;
    const g = perc(t, (hi ? 0.25 : 0.65) * vel, len, 0.005);
    const o = osc(L, 'sawtooth', mtof(m) * (1 + (rnd() - 0.5) * 0.003), t, end); o.connect(g);
    g.connect(bus(L, hi ? 'ostHi' : 'ostLo', hi ? { lp: 3000, send: 0.4, pan: 0.3 } : { lp: 1500, q: 1, send: 0.2, pan: -0.25 }));
    done(o, [g]);
  }
  // Archi tesi (strato di tensione): crome su una nota acuta, attacco un po' morbido.
  function tense(L, m, t, vel) {
    const len = STEP * 1.8, end = t + len + 0.05; if (!admit(t, end, false)) return;
    const g = env(t, 0.025, 0.1 * vel, t + len * 0.6, end);
    const a = osc(L, 'sawtooth', mtof(m), t, end), b = osc(L, 'sawtooth', mtof(m) * 1.006, t, end);
    a.connect(g); b.connect(g); g.connect(bus(L, 'tense', { lp: 2600, send: 0.5, pan: 0.35 }));
    done(a, [g]);
  }
  // Campana lontana (il passo dei larici): parziali non armoniche che si spengono a tempi diversi.
  function bell(L, m, t, vel = 1) {
    const end = t + 3.2; if (!admit(t, end, false)) return;
    const f0 = mtof(m), B = bus(L, 'bell', { send: 0.8, dry: 0.5, pan: -0.3 }), ns = [];
    let o; for (const [k, a, dec] of [[1, 1, 3], [2, 0.5, 2.2], [2.76, 0.35, 1.6], [5.4, 0.15, 0.8]]) {
      const g = perc(t, 0.07 * vel * a, dec, 0.002); o = osc(L, 'sine', f0 * k, t, end); o.connect(g); g.connect(B); ns.push(g);
    }
    done(o, ns);
  }
  // Voce della melodia secondo il profilo: corno, legno, o la loro coppia sul lato opposto.
  function play(L, inst, m, t, dur, vel) {
    if (inst === 'reed') reed(L, m, t, dur, vel);
    else if (inst === 'reed2') reed(L, m, t, dur, vel * 0.9, 'reed2', 0.45);
    else if (inst === 'horn2') horn(L, m, t, dur, vel, 'horn2', 0.35);
    else horn(L, m, t, dur, vel);
  }

  /* ---------- orologio, sezioni e strati ---------- */
  let mode = 'off', secStart = null, n = 0, lastNow = 0, finEnd = 0, stingEnd = 0;
  let raw = 0, sm = 0, lastHit = -1e9, lastUp = 0, state = 'calm', lastDuck = -1e9;
  // Profilo della sezione in corso e profilo chiesto per la prossima partita; pend: fase nuova, al prossimo giro.
  let prof = DEFAULT_PROFILE, wantProf = DEFAULT_PROFILE, pend = null;
  let BEAT = BEAT0, STEP = STEP0, BAR = BEAT0 * 4;
  const timeline = [];   // cambi di stato (per le anteprime e i test)
  function useProfile(p) { prof = p; BEAT = 60 / p.bpm; STEP = BEAT / 4; BAR = BEAT * 4; }

  function resetLayers(t) {
    setLevel(LY.calm, 1, t, 0.01); setLevel(LY.mel, 1, t, 0.01); setLevel(LY.ten, 0, t, 0.01); setLevel(LY.bat, 0, t, 0.01);
    raw = 0; sm = 0; lastHit = -1e9; state = 'calm';
  }
  // Ferma la sezione in corso: sfuma in mezzo secondo e interrompe le sue note (il riverbero si spegne da solo).
  function cut(t) {
    const tk = t + 0.5;
    setLevel(sec, 0, t, 0.45);
    for (const e of live) if (e.end > tk) { try { e.s.stop(tk); } catch (er) { /* già fermata */ } e.end = tk; }
  }
  const isSec = m => m === 'menu' || m === 'game' || m === 'finale';
  function startSec(p, ts) {
    useProfile(p); setLevel(sec, 1, ts, 0.01); resetLayers(ts);
    secStart = ts; n = 0;
  }
  function setMode(m, t) {
    if (m === mode) return;
    const was = isSec(mode);
    if (was) cut(t);
    mode = m; pend = null; timeline.push({ t, mode: m });
    if (isSec(m)) {
      let ts = t + (was ? 0.55 : 0.05);
      if (m === 'finale') ts = Math.max(ts, stingEnd - 1.5);   // dopo la frase di vittoria, se suona ancora
      startSec(m === 'game' ? wantProf : m === 'finale' ? musicProfile('valle-liberata') : DEFAULT_PROFILE, ts);
      if (m === 'finale') { setLevel(LY.bat, 1, ts, 0.01); finEnd = ts + FIN_BARS * BAR + 3.5; }
    } else {
      secStart = null;
      if (m === 'win' || m === 'lose' || m === 'defeat') { const t0 = t + (was ? 0.45 : 0.05); stingEnd = t0 + sting(m, t0); }
    }
  }
  // Profilo della partita (id della missione, 'contrattacco/2' nella seconda fase; null: schermaglia). Vale dalla
  // prossima partita; se la partita è in corso, una fase nuova della stessa missione entra all'inizio del giro
  // successivo (stesso tempo, nessuno strappo), un'altra missione riparte da capo.
  function setProfile(id, t) {
    const p = musicProfile(id);
    if (p === wantProf) return;
    wantProf = p;
    if (mode !== 'game') return;
    if (p === prof) { pend = null; return; }
    timeline.push({ t, profile: p.id });
    if (p.base && p.base === prof.base && p.bpm === prof.bpm) { pend = p; return; }
    cut(t); startSec(p, t + 0.55);
  }
  // Segnale di combattimento: w è il peso (0–1) già scalato per vicinanza e coinvolgimento del giocatore.
  function hit(w, t) { if (mode !== 'game') return; raw = Math.min(1.3, raw + w); lastHit = t; }
  function enter(next, t) {
    const from = state; state = next; timeline.push({ t, state: next, intensity: +sm.toFixed(2) });
    if (next === 'battle') {
      setLevel(LY.bat, 1, t, 2); setLevel(LY.mel, 0, t, 1.5); setLevel(LY.calm, 0.5, t, 2); setLevel(LY.ten, 0.5, t, 2);
      // piatto in crescendo fino al primo battito utile, poi il colpo
      const k = Math.ceil((t + 1.2 - secStart) / BEAT), tb = secStart + k * BEAT;
      swell(LY.st, t + 0.05, tb, 1); crash(LY.st, tb, 1); drum(LY.st, tb, 1, true);
    } else if (next === 'tension') {
      setLevel(LY.bat, 0, t, 3.5); setLevel(LY.ten, 1, t, from === 'battle' ? 3 : 1.5);
      setLevel(LY.mel, 0.8, t, from === 'battle' ? 4 : 2); setLevel(LY.calm, 0.9, t, 3);
    } else {
      setLevel(LY.bat, 0, t, 3.5); setLevel(LY.ten, 0, t, 3); setLevel(LY.mel, 1, t, 4); setLevel(LY.calm, 1, t, 3);
    }
  }
  // Solo per l'album (opts.manual): porta la partita nello stato voluto, senza segnali di combattimento.
  function force(next, t) {
    if (mode !== 'game' || next === state) return;
    raw = sm = next === 'battle' ? 0.8 : next === 'tension' ? 0.3 : 0;
    enter(next, t);
  }
  // Intensità: integratore che perde (pochi segnali radi non bastano), cala piano finché arrivano segnali e in fretta
  // HOLD secondi dopo l'ultimo; levigata in ~0,35 s; soglie con isteresi (tensione 0,15/0,1, battaglia 0,45/0,25).
  function update(t) {
    const dt = Math.max(0, t - lastUp); lastUp = t;
    let j = 0; for (const e of live) if (e.end > t) live[j++] = e; live.length = j;
    if (mode !== 'game' || secStart == null || opts.manual) return;
    raw *= Math.exp(-dt / (t - lastHit > HOLD ? 2.2 : 6));   // lenta mentre arrivano segnali, veloce dopo
    sm += (raw - sm) * (1 - Math.exp(-dt / 0.35));
    let next = state;
    if (state === 'calm') { if (sm > 0.45) next = 'battle'; else if (sm > 0.15) next = 'tension'; }
    else if (state === 'tension') { if (sm > 0.45) next = 'battle'; else if (sm < 0.1) next = 'calm'; }
    else if (sm < 0.25) next = sm < 0.1 ? 'calm' : 'tension';
    if (next !== state && t >= secStart) enter(next, t);
  }
  // Pianifica i sedicesimi che cadono prima di until. Se l'orologio è rimasto indietro, salta avanti.
  function schedule(now, until) {
    lastNow = now;
    if (mode === 'finale' && now > finEnd) setMode('menu', now);   // finita «Valle liberata», torna il tema del menu
    if (secStart == null) return;
    if (secStart + n * STEP < now - 0.05) n = Math.ceil((now - secStart) / STEP);
    for (let tn = secStart + n * STEP; tn < until; tn = secStart + n * STEP) {
      if (pend && (n & 127) === 0) { useProfile(pend); pend = null; }
      const j = (rnd() - 0.5) * 0.008;   // un filo d'imprecisione umana
      if (mode === 'game') stepGame(n, tn, j); else if (mode === 'menu') stepMenu(n, tn, j); else stepFinale(n, tn, j);
      n++;
    }
  }

  // Partita: il profilo decide giri, tema, strumenti e carattere; senza opzioni è il materiale di base.
  function stepGame(n, t, j) {
    const P = prof, c = P.cfg, bc = c.bat || {};
    const bar = n >> 4, s = n & 15, ph = bar >> 3, pb = bar & 7, kind = ph & 1 ? 'B' : 'A', cyc = ph >> 1;
    const [c1, c2] = halves(P.PROG[kind][pb]), K = P.CH[s < 8 ? c1 : c2], split = c1 !== c2;
    const C = LY.calm, M = LY.mel, T = LY.ten, B = LY.bat;
    // variazioni a ogni giro: tema, tema all'ottava bassa, pausa del corno (coro e arpa in primo piano)
    const v = cyc % 3, hornT = kind === 'A' ? [0, null, -12][v] : v === 2 ? null : 0;
    if (audible(C, t)) {
      if (s === 0 || (s === 8 && split)) {
        const d = split ? BEAT * 2 : BAR, cm = c.choir || 'some';
        pad(C, K, t, d, c.bright ?? 1, c.padLvl ?? 1); bass(C, K, t, d);
        if (cm === 'full' || (cm === 'some' && (hornT == null || pb % 4 >= 2))) choir(C, K, t, d, hornT == null ? 1 : 0.8);
      }
      const hp = c.harp || 'arp', solo = pb & 1 || hornT == null;
      if (hp === 'arp') { if (s % 2 === 0 && s <= 10 && solo) harp(C, arpNote(K, s >> 1), t + j, 1 - s * 0.04); }
      else if (hp === 'sparse') { if ((s === 0 || s === 6 || s === 10) && solo) harp(C, arpNote(K, s === 0 ? 0 : s === 6 ? 2 : 4), t + j, 0.7); }
      else if (hp === 'ripple') harp(C, arpNote(K, RIP[s]), t + j * 0.5, (s % 4 === 0 ? 0.6 : 0.38) * (solo ? 1 : 0.75));
      if (s === 0 && pb === 0) timp(C, K.bass, t, 0.7);
      if (kind === 'B' && pb === 7 && s >= 8) timp(C, K.bass, t + j, 0.12 + (s - 8) * 0.07, 0.4);
      else if (c.timp === 'roll' && pb === 3 && s >= 8) timp(C, K.bass, t + j, 0.1 + (s - 8) * 0.05, 0.4);
      if (c.timp === 'pedal' && (s === 0 || s === 3 || s === 8 || s === 11) && !(s === 0 && pb === 0)) timp(C, K.bass, t + j, s % 8 ? 0.16 : 0.28, 0.9);
      if (c.bell && s === 0 && pb % 4 === 0) bell(C, K.pad[3] + 12, t, 0.8);
      if (c.pulse && s % 2 === 0) ost(C, K.bass + 12 + (s === 6 || s === 14 ? 12 : 0), t + j * 0.5, s % 4 === 0 ? 0.42 : 0.28, false);
    }
    if (hornT != null && audible(M, t)) {
      const at = pb * 16 + s, e = P.MELS[kind].get(at); if (e) play(M, P.lead[kind], e.m + hornT, t, e.d * BEAT - 0.03, 1);
      const S2 = P.MELS['S' + kind], e2 = S2 && S2.get(at); if (e2) play(M, P.second[kind], e2.m + hornT, t, e2.d * BEAT - 0.03, 0.7);
    }
    if (audible(T, t)) {
      const p = K.pad;
      if (s % 2 === 0) tense(T, (s & 2 ? p[2] : p[3]) + 12, t + j, s % 8 === 0 ? 1 : 0.7);
      if (s === 0 || s === 3 || s === 8 || s === 11) drum(T, t + j, s % 8 ? 0.3 : 0.45, s % 8 === 0);
      if (s % 2 === 1) shaker(T, t + j, s % 4 === 3 ? 0.9 : 0.5);
    }
    if (audible(B, t)) {
      const p = K.pad, root = K.bass + 12, O = OSTS[bc.ost] || OST, D = DRUMS[bc.drum] || DRUM, o = O[s];
      if (o != null) ost(B, root + o, t + j * 0.5, s % 4 === 0 ? 1 : s & 1 ? 0.55 : 0.75, false);
      if (s % 2 === 0 && bc.hi !== false) ost(B, p[(s >> 1) & 1 ? 3 : 2] + 12, t + j * 0.5, s % 4 === 0 ? 1 : 0.7, true);
      if (pb === 7 && s >= 8) drum(B, t + j, 0.45 + (s - 8) * 0.07, s === 8);
      else { const d = D[s]; if (d) drum(B, t + j, d[1], !!d[0]); }
      const sn = bc.snare || 'std', roll = (pb === 3 || pb === 7) && s > 12;
      if (sn === 'std' || sn === 'march') {
        if (s === 4 || s === 12) snare(B, t + j, 0.8);
        else if (roll) snare(B, t + j, 0.35 + (s - 12) * 0.12);
        else if (sn === 'std' ? s === 14 : s & 1) snare(B, t + j, sn === 'std' ? 0.25 : 0.16);
      } else if (sn === 'light') { if (s === 12) snare(B, t + j, 0.5); else if (pb === 7 && s > 12) snare(B, t + j, 0.25 + (s - 12) * 0.08); }
      else if (sn === 'half') { if (s === 8) snare(B, t + j, 0.85); else if (roll) snare(B, t + j, 0.3 + (s - 12) * 0.1); }
      const sb = bc.stabs || 'std';
      if (sb === 'few' ? s === 0 && pb % 2 === 0 : s === 0 || (s === 6 && pb % 2 === 0) || (s === 10 && pb % 2 === 1) || (sb === 'many' && s === 12)) stab(B, K, t, s === 0 ? 1 : 0.7);
      if (s === 0 && (pb % 2 === 0 || bc.timp === 'every')) timp(B, K.bass, t, 0.7, 1.2);
      if (s === 0 && (pb === 0 || (bc.crash4 && pb === 4))) crash(B, t, 0.8);
      if (bc.choir && (s === 0 || (s === 8 && split))) choir(B, K, t, split ? BEAT * 2 : BAR, 0.85);
      if (!(kind === 'B' && cyc % 2 === 1)) {
        const at = pb * 16 + s, e = P.MELS['H' + kind].get(at);
        if (e) brass(B, e.m, t, e.d * BEAT - 0.02, bc.leadVel ?? 1, bc.counter ? 'brassR' : 'brass', bc.counter ? 0.4 : 0.12);
        const Lo = P.MELS['L' + kind], el = Lo && Lo.get(at); if (el) brass(B, el.m, t, el.d * BEAT - 0.02, 0.6, 'brassLo', -0.2);
        const Kc = P.MELS['K' + kind], ek = Kc && Kc.get(at); if (ek) brass(B, ek.m, t, ek.d * BEAT - 0.02, 0.75, 'brassL', -0.4);
      }
    }
  }
  function stepMenu(n, t, j) {
    const bar = n >> 4, s = n & 15, rep = bar >> 3, pb = bar & 7;
    const [c1, c2] = halves(PROG.M[pb]), K = CH[s < 8 ? c1 : c2], split = c1 !== c2, C = LY.calm, M = LY.mel;
    const melo = rep % 2 === 0;   // un giro con la melodia, uno di solo tappeto, arpa e coro
    if (s === 0 || (s === 8 && split)) {
      const d = split ? BEAT * 2 : BAR;
      pad(C, K, t, d, 0.75, 0.9); bass(C, K, t, d, 0.8);
      if (!melo || pb >= 4) choir(C, K, t, d, melo ? 0.7 : 1);
    }
    if (s % 2 === 0 && (pb & 1 || !melo)) harp(C, arpNote(K, s >> 1), t + j, 0.9 - s * 0.03);
    if (s === 0 && pb === 0 && rep > 0) timp(C, K.bass, t, 0.4);
    if (melo) {
      const e = MELS.M.get(pb * 16 + s);
      if (e) { if (rep % 4 === 0) reed(M, e.m, t, e.d * BEAT - 0.03, 1); else horn(M, e.m - 12, t, e.d * BEAT - 0.03, 0.9); }
    }
  }
  // «Valle liberata» (fine della campagna, 28 battute a 80 battiti): l'alba con il legno sul tema in re maggiore,
  // i corni a due voci con il coro e l'arpa ad onde, il tema eroico degli ottoni con timpani e piatti, poi la
  // cadenza si bemolle – do – re con la linea che sale re–mi–fa diesis e l'accordo finale tenuto.
  function stepFinale(n, t, j) {
    const bar = n >> 4, s = n & 15, P = prof, C = LY.calm, M = LY.mel, B = LY.bat;
    if (bar >= FIN_BARS) return;
    if (bar < 24) {
      const ph = bar >> 3, pb = bar & 7, kind = ph === 1 ? 'B' : 'A', at = pb * 16 + s;
      const [c1, c2] = halves(P.PROG[kind][pb]), K = P.CH[s < 8 ? c1 : c2], split = c1 !== c2;
      if (s === 0 || (s === 8 && split)) {
        const d = split ? BEAT * 2 : BAR;
        pad(C, K, t, d, ph ? 1.1 : 0.8, ph === 2 ? 1.1 : 1); bass(C, K, t, d, ph ? 1 : 0.8);
        if (ph === 2 || (ph === 1 && pb % 4 >= 2)) choir(C, K, t, d, ph === 2 ? 1 : 0.8);
      }
      if (ph === 1) harp(C, arpNote(K, RIP[s]), t + j * 0.5, s % 4 ? 0.36 : 0.55);
      else if (s % 2 === 0 && s <= 10 && (ph === 2 || pb & 1)) harp(C, arpNote(K, s >> 1), t + j, 0.8 - s * 0.03);
      if (ph === 0) { const e = P.MELS.A.get(at); if (e) reed(M, e.m, t, e.d * BEAT - 0.03, 1); }
      else if (ph === 1) {
        const e = P.MELS.B.get(at); if (e) horn(M, e.m, t, e.d * BEAT - 0.03, 1);
        const e2 = P.MELS.SB.get(at); if (e2) horn(M, e2.m, t, e2.d * BEAT - 0.03, 0.7, 'horn2', 0.35);
      } else {
        const e = P.MELS.HA.get(at); if (e) brass(B, e.m, t, e.d * BEAT - 0.02, 1);
        const h = P.MELS.A.get(at); if (h) horn(M, h.m - 12, t, h.d * BEAT - 0.03, 0.8);
        if (s === 0) { stab(B, K, t, 0.9); timp(B, K.bass, t, 0.8, 1.4); }
        if (s === 8 && pb % 2) stab(B, K, t, 0.6);
        if (s === 4 || s === 12) snare(B, t + j, 0.4);
        if (s === 0 || s === 8) drum(B, t + j, s ? 0.5 : 0.7, true);
        if (s === 0 && (pb === 0 || pb === 4)) crash(B, t, 0.7);
      }
      if (bar === 7 && s >= 8) timp(C, K.bass, t + j, 0.12 + (s - 8) * 0.06, 0.4);
      if (bar === 15 && s === 8) swell(LY.st, t, t + BEAT * 2, 0.8);
      return;
    }
    const k = bar - 24, K = P.CH[['b6', 'b7', '1', '1'][k]];
    if (s === 0 && k < 3) {
      const d = k < 2 ? BAR : BAR * 2;
      pad(C, K, t, d, 1.2, 1.2); bass(C, K, t, d, 1.1); choir(C, K, t, d, 1);
      for (const m of K.pad) brass(B, m + 12, t, d - 0.1, 0.45, 'brassCh', -0.1);
      brass(B, [74, 76, 78][k], t, d - 0.05, 1);
      horn(M, [62, 64, 66][k], t, d - 0.05, 0.8);
      timp(B, K.bass, t, 1, k < 2 ? 1.5 : 3);
      if (k === 2) { crash(B, t, 1, 3.5); drum(B, t, 1, true); [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => harp(C, m, t + 0.1 + i * STEP, 0.8)); }
    }
    if (k === 1 && s >= 8) timp(B, K.bass, t + j, 0.2 + (s - 8) * 0.07, 0.3);
  }

  /* ---------- frasi brevi: vittoria, sconfitta, cambio di fase; «Brigata sconfitta» ---------- */
  function sting(kind, t0) {
    const L = LY.st, b = kind === 'phase' ? BEAT : BEAT0;
    if (kind === 'win') {
      // terzina d'ottoni re–la–re, poi si bemolle, do e re maggiore che si apre
      [62, 69, 74].forEach((m, i) => brass(L, m, t0 + i * b / 3, b / 3 - 0.02, 0.9));
      const chords = [[[58, 62, 65, 70], 34], [[60, 64, 67, 72], 36]];
      chords.forEach(([vs, bs], i) => { const t = t0 + b * (1 + i); for (const m of vs) brass(L, m, t, b * 0.9, 0.55); stab(L, i ? CH.C : CH.Bb, t, 0.8); timp(L, bs, t, 0.8, 0.8); });
      const t3 = t0 + b * 3;
      for (let k = 0; k < 8; k++) timp(L, 33, t0 + b * 2 + k * b / 8, 0.2 + k * 0.06, 0.3);
      for (const m of [62, 66, 69, 74]) brass(L, m, t3, b * 4, 0.6);
      pad(L, CH.D, t3, b * 4, 1.2, 1.3); bass(L, CH.D, t3, b * 4); crash(L, t3, 1, 3); timp(L, 38, t3, 1, 2);
      [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => harp(L, m, t3 + 0.1 + i * STEP0, 0.8));
      return t3 + b * 4 + 2.5 - t0;
    }
    if (kind === 'lose') {
      // lenta: sol minore, re minore sul la, re minore; il corno scende fino al re
      const lb = 1.0;
      pad(L, CH.Gm, t0, lb * 2, 0.7); bass(L, CH.Gm, t0, lb * 2); timp(L, 43, t0, 0.5, 2);
      pad(L, CH.DmA, t0 + lb * 2, lb * 2, 0.65); bass(L, CH.DmA, t0 + lb * 2, lb * 2);
      pad(L, CH.Dm, t0 + lb * 4, lb * 5, 0.55, 1.1); bass(L, CH.Dm, t0 + lb * 4, lb * 5); choir(L, CH.Dm, t0 + lb * 4, lb * 5, 0.8);
      timp(L, 38, t0 + lb * 4, 0.55, 2.4);
      let tt = t0; for (const [m, d] of [[70, 2], [69, 2], [65, 1], [64, 1], [62, 4]]) { horn(L, m, tt, d * lb - 0.04, 0.85); tt += d * lb; }
      return lb * 9 + 2.5;
    }
    if (kind === 'defeat') {
      // «Brigata sconfitta» (circa 42 s, un battito al secondo): la testa del tema rallentata, prima al corno con un
      // tamburo velato che si spegne, poi al legno con il coro; chiude il corno grave, la–re, sull'accordo di re minore.
      const lb = 1.0, bars = [['Dm'], ['Bb'], ['Gm'], ['A'], ['Dm'], ['Gm'], ['Bb'], ['Asus', 'A'], ['Dm']];
      const mel = [[[69, 3], [67, 0.5], [65, 0.5]], [[62, 2], [65, 1], [70, 1]], [[70, 2], [69, 1], [67, 1]], [[64, 2], [61, 2]],
        [[65, 3], [64, 1]], [[70, 2], [67, 2]], [[65, 2], [62, 2]], [[62, 2], [61, 2]], [[57, 2], [50, 6]]];
      bars.forEach((cs, i) => {
        const t = t0 + i * 4 * lb, d = (i === 8 ? 8 : 4) * lb, dd = d / cs.length;
        cs.forEach((c, h) => {
          const tt = t + h * dd; pad(L, CH[c], tt, dd, 0.62 - i * 0.015, 1); bass(L, CH[c], tt, dd, 0.9);
          if (i >= 4) choir(L, CH[c], tt, dd, i === 8 ? 0.9 : 0.6);
        });
        let tt = t; for (const [m, md] of mel[i]) { if (i < 4 || i === 8) horn(L, m, tt, md * lb - 0.04, 0.8); else reed(L, m, tt, md * lb - 0.04, 0.75); tt += md * lb; }
        if (i < 4) for (const k of [0, 2]) drum(L, t + k * lb, 0.34 - i * 0.05, true);
      });
      timp(L, 38, t0, 0.5, 2.2); timp(L, 38, t0 + 16 * lb, 0.45, 2.2); timp(L, 38, t0 + 32 * lb, 0.4, 3);
      [74, 69, 65, 62].forEach((m, i) => harp(L, m, t0 + 33 * lb + i * 0.75, 0.5));
      return 40 * lb + 3;
    }
    // cambio di fase: motivo d'ottoni sulla fondamentale dell'accordo in corso, al battito successivo
    const tb = secStart != null ? secStart + Math.ceil((t0 - secStart) / BEAT) * BEAT : t0;
    const ch = secStart != null ? chordAt(Math.round((tb - secStart) / STEP)) : CH.Dm;
    let r = ch.bass; while (r < 50) r += 12;
    brass(L, r, tb, b / 2 - 0.02, 0.8); brass(L, r + 7, tb + b / 2, b / 2 - 0.02, 0.85); brass(L, r + 12, tb + b, b * 2, 0.9);
    timp(L, ch.bass, tb + b, 0.7); crash(L, tb + b, 0.35, 1.6);
    duck(0.3, tb, b * 3);
    return tb + b * 3 + 1.5 - t0;
  }
  // Accordo (oggetto con tappeto e basso) al sedicesimo step della sezione in corso.
  function chordAt(step) {
    const bar = step >> 4, s = step & 15, pb = bar & 7;
    if (mode === 'menu') { const [c1, c2] = halves(PROG.M[pb]); return CH[s < 8 ? c1 : c2]; }
    if (mode === 'finale' && bar >= 24) return prof.CH[bar < 25 ? 'b6' : bar < 26 ? 'b7' : '1'];
    const [c1, c2] = halves(prof.PROG[(bar >> 3) & 1 ? 'B' : 'A'][pb]); return prof.CH[s < 8 ? c1 : c2];
  }
  // Abbassa la musica per poco (esplosioni grandi, frasi): amount 0–1, per hold secondi.
  function duck(amount, t, hold = 0.25) {
    if (t - lastDuck < 0.3) return; lastDuck = t;
    const p = duckG.gain; holdAt(p, t);
    p.setTargetAtTime(1 - amount, t, 0.03); p.setTargetAtTime(1, t + hold, 0.6);
  }
  function setVolume(v, t) { holdAt(out.gain, t); out.gain.setTargetAtTime(v, t, 0.06); }

  return {
    setMode, setProfile, hit, force, update, schedule, duck, setVolume,
    sting: (kind, t) => sting(kind, t),
    state: () => ({ mode, state, profile: prof.id, key: prof.key, bpm: prof.bpm, intensity: +sm.toFixed(3), notes: notes.length, live: live.length, played: stats.notes, dropped: stats.dropped }),
    timeline,
  };
}

/* ---------- controllo dal vivo ---------- */
const KEY_ON = 'wz.musica', KEY_VOL = 'wz.musica.volume';
const hasLS = (() => { try { return typeof localStorage !== 'undefined' && !!localStorage; } catch (e) { return false; } })();
const load = (k, d) => { try { const v = hasLS ? localStorage.getItem(k) : null; return v == null ? d : v; } catch (e) { return d; } };
const save = (k, v) => { try { if (hasLS) localStorage.setItem(k, String(v)); } catch (e) { /* archivio non disponibile */ } };
const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
const VOL_SCALE = 0.9;   // la musica resta sotto gli effetti anche con il suo cursore al massimo

let mOn = load(KEY_ON, '1') !== '0';
let mVol = clamp01(parseFloat(load(KEY_VOL, '0.5')));
let eng = null, ac = null, timer = 0, want = 'menu', wantKey = null;
const listeners = new Set();
const changed = () => { for (const f of listeners) f(); };

export const musicOn = () => mOn;
export const getMusicVolume = () => mVol;
export function onMusicChange(fn) { listeners.add(fn); }
// Collega la musica al contesto audio del gioco (creato al primo gesto) e al bus principale.
export function attachMusic(ctx, dest) {
  if (eng) return;
  ac = ctx; eng = createMusic(ctx, dest, { volume: mOn ? mVol * VOL_SCALE : 0 });
  eng.setProfile(wantKey, ctx.currentTime);
  if (mOn) eng.setMode(want, ctx.currentTime);
  document.addEventListener('visibilitychange', run);
  run();
}
// Il timer gira solo con la musica accesa e la pagina visibile.
function run() {
  const go = !!eng && mOn && document.visibilityState !== 'hidden';
  if (go && !timer) timer = setInterval(tick, TICK_MS);
  else if (!go && timer) { clearInterval(timer); timer = 0; }
}
function tick() {
  if (!eng || ac.state !== 'running') return;
  const now = ac.currentTime;
  eng.update(now); eng.schedule(now, now + LOOKAHEAD);
}
export function setMusic(on) {
  mOn = !!on; save(KEY_ON, mOn ? '1' : '0');
  if (eng) {
    const t = ac.currentTime;
    eng.setVolume(mOn ? mVol * VOL_SCALE : 0, t);
    eng.setMode(mOn ? want : 'off', t);
  }
  run(); changed();
}
export function setMusicVolume(v) {
  mVol = clamp01(v); save(KEY_VOL, mVol.toFixed(2));
  if (eng && mOn) eng.setVolume(mVol * VOL_SCALE, ac.currentTime);
  changed();
}
// Profilo della partita: id della missione in corso (null in schermaglia) e fase dell'obiettivo; in «Contrattacco»
// la fase 2 passa al profilo trionfale. Va chiamata prima di musicMode('game').
export function musicMission(id, stage) {
  const k = id && stage === 2 && MUSIC_PROFILES.includes(id + '/2') ? id + '/2' : (id || null);
  if (k === wantKey) return;
  wantKey = k;
  if (eng) eng.setProfile(k, ac.currentTime);
}
// Momento musicale: 'menu', 'game', 'win', 'lose', 'finale' (fine della campagna). Le richieste uguali alla
// precedente non cambiano nulla.
export function musicMode(m) {
  if (m === want) return;
  want = m;
  if (eng && mOn) eng.setMode(m, ac.currentTime);
}
export function musicHit(w) { if (eng && mOn && w > 0) eng.hit(w, ac.currentTime); }
export function musicDuck(amount) { if (eng && mOn) eng.duck(amount, ac.currentTime); }
export function musicSting(kind) { if (eng && mOn && ac.state === 'running') eng.sting(kind, ac.currentTime + 0.02); }
export function musicState() { return { on: mOn, volume: mVol, want, ctx: ac ? ac.state : 'none', timer: !!timer, ...(eng ? eng.state() : {}) }; }
