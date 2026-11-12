// Disegno del fotogramma nello stile «Rilievo»: terreno cotto a pezzi (terrain.js), segni che restano (decals.js),
// acqua, alberi vivi, nuvole e colore (atmos.js), edifici (structs.js), mezzi (vehicles.js), effetti (effects.js),
// luce della notte (light.js), nebbia, barre, selezione, minimappa. Legge lo stato del motore senza modificarlo.
// Il livello di qualità (quality.js) decide che cosa si disegna; la notte vale solo nelle missioni notturne (S.night).
import {
  TILE, MW, MH, N, P, DIRT, CHASSIS, STRUCTS, S, terr, deposits, occ, vis, explored, proj, ent, canSee, canPlace, clamp, ftile,
} from '../engine/index.js';
import { drawPlaces } from './urban.js';
import { placesOf, placesOn } from './prefs.js';
import { ui, cam, view, hover, fxs, PAL, reducedMotion } from './state.js';
import { fxq } from './quality.js';
import { layout } from './layout.js';
import { unitPose, poseOf, recoil, resetAnim } from './anim.js';
import { resetTerrain, drawTerrain, pumpTerrain, terrainStats, terrainReady } from './terrain.js';
import { resetDecals, drawDecals } from './decals.js';
import { hullSprite, turretSprite, truckSprite, truckArm, drawWreck, spriteFrame } from './vehicles.js';
import { structShadow, drawStruct, drawRuin, beacons, WINDOWS } from './structs.js';
import { drawWater, drawClouds, drawTrees, grade } from './atmos.js';
import { nightLight, glow, LAMP, RED, GLOW_W } from './light.js';
import { ruins, drawSmoke, drawHot, resetEffects, dust, vdust, clock, shakeAllowed } from './effects.js';
import { NIGHT, CHUNK } from './look.js';

export { spawnFx, updParts, unitSpawned, structPlaced, structBuilt, mark } from './effects.js';
export { drawVehicle, vehicleExtent, WEAPON_REACH } from './vehicles.js';

let cv, ctx, mini, mctx, mmBase = null, vig = null;
const fogC = document.createElement('canvas'); fogC.width = MW; fogC.height = MH;
const fogG = fogC.getContext('2d'); const fogImg = fogG.createImageData(MW, MH);

export function initRender(canvas, miniCanvas) {
  cv = canvas; ctx = cv.getContext('2d'); mini = miniCanvas; mctx = mini.getContext('2d');
  vig = document.getElementById('vignette');
}

/* ---------- camera ---------- */
// La tela della mappa usa al massimo la risoluzione del livello di qualità (nei livelli bassi meno pixel da riempire).
export function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  view.dpr = Math.min(dpr, fxq.q.res);
  const r = cv.getBoundingClientRect(); view.cw = Math.max(1, r.width); view.ch = Math.max(1, r.height);
  const w = Math.round(view.cw * view.dpr), h = Math.round(view.ch * view.dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  // riassegnare width o height svuota la tela: solo se la misura cambia davvero
  const m = mini.getBoundingClientRect(), mw = Math.round(Math.max(1, m.width) * dpr), mh = Math.round(Math.max(1, m.height) * dpr);
  if (mini.width !== mw || mini.height !== mh) { mini.width = mw; mini.height = mh; renderMini(); }
  if (vig) vig.hidden = !fxq.q.vignette;
  clampCam();
}
export function clampCam() {
  const vw = view.cw / cam.z, vh = view.ch / cam.z, m = 64;
  cam.x = vw > MW * TILE + 2 * m ? (MW * TILE - vw) / 2 : clamp(cam.x, -m, MW * TILE - vw + m);
  cam.y = vh > MH * TILE + 2 * m ? (MH * TILE - vh) / 2 : clamp(cam.y, -m, MH * TILE - vh + m);
}
export function centerOn(x, y) { cam.x = x - view.cw / cam.z / 2; cam.y = y - view.ch / cam.z / 2; clampCam(); }
export function screenToWorld(x, y) { return { x: cam.x + x / cam.z, y: cam.y + y / cam.z }; }

/* ---------- terreno e nebbia ---------- */
// Colori della minimappa e della carta del briefing, per codice di terreno.
const MINI_RGB = [[86, 98, 62], [117, 101, 72], [48, 78, 88], [112, 108, 98], [52, 68, 38], [146, 102, 82], [64, 64, 61]];
function terrainImage(img) {
  for (let i = 0; i < N; i++) { const c3 = MINI_RGB[terr[i]] || MINI_RGB[0]; img.data[i * 4] = c3[0]; img.data[i * 4 + 1] = c3[1]; img.data[i * 4 + 2] = c3[2]; img.data[i * 4 + 3] = 255; }
}
// Nuova mappa: pezzi di terreno da cuocere, segni da capo, base della minimappa.
export function renderTerrain(seed) {
  resetTerrain(seed); resetDecals();
  mmBase = document.createElement('canvas'); mmBase.width = MW; mmBase.height = MH;
  const mg = mmBase.getContext('2d'), img = mg.createImageData(MW, MH);
  terrainImage(img);
  for (const d of deposits) { const i = d.x + d.y * MW; img.data[i * 4] = 20; img.data[i * 4 + 1] = 18; img.data[i * 4 + 2] = 14; }
  mg.putImageData(img, 0, 0);
}
// Nebbia di guerra (64×64, sfumata quando si disegna): di notte più blu e più fitta.
export function updateFogImage() {
  const d = fogImg.data, night = !!(S && S.night), c = night ? NIGHT.fog : [12, 14, 13], a1 = night ? NIGHT.fogA[0] : 125, a2 = night ? NIGHT.fogA[1] : 255;
  for (let i = 0; i < N; i++) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = vis[i] ? 0 : explored[i] ? a1 : a2; }
  fogG.putImageData(fogImg, 0, 0);
}
// Nuova mappa o partita caricata (evento «world» del motore): via tutto lo stato visivo della partita precedente.
// I tempi di S ripartono da capo, quindi un segnale o un'animazione rimasti avrebbero un'età senza senso.
export function resetFx() {
  resetEffects(); resetAnim();
  barBg.length = 0; barCol.clear(); burnList.length = 0;
}
// Stato del disegno per i test: modo di cottura del terreno, pezzi pronti, visuale pronta.
export function renderState() {
  const vr = { x0: cam.x, y0: cam.y, x1: cam.x + view.cw / cam.z, y1: cam.y + view.ch / cam.z };
  return { ...terrainStats, ready: terrainReady(vr, variant()), night: !!(S && S.night), level: fxq.q.name };
}
// Variante dei pezzi di terreno per il livello in uso: chiome cotte se gli alberi non sono vivi, tinta della notte
// cotta se la tela della luce è spenta.
const variant = () => ({ canopy: !fxq.q.trees || reducedMotion(), dark: !!(S && S.night) && !fxq.q.light });

/* ---------- mezzi ---------- */
// k: scala delle sagome già pronte. dt: secondi dal fotogramma prima; run: partita in corso (la polvere si solleva
// solo allora); night: sagome con la tinta della notte e il contorno del lato.
// Il mezzo si disegna nella posizione ammorbidita (anim.js): scafo con sterzata morbida e beccheggio, torretta che
// rincula dopo lo sparo, ruote e cingoli che girano con la strada fatta; sullo sterrato alza polvere.
function drawUnit(g, u, t, ct, k, dt, Q, rm, run, night) {
  const lo = fxq.level === 0, dirt = terr[ftile(u.x) + ftile(u.y) * MW] === DIRT;
  const v = unitPose(u, dt, ct, dirt && !lo && !u.builder ? 0.55 : 0, rm);
  const t0 = fxs.spawns.get(u.id), a = t0 == null ? 9 : ct - t0;
  let x = v.x, y = v.y;
  if (a < 0.6) {
    // mezzo appena uscito dalla fabbrica: arriva dalla porta e compare in dissolvenza
    const f = Math.max(0, a / 0.6), back = rm ? 0 : 14 * (1 - f) * (1 - f);
    g.globalAlpha = 0.15 + 0.85 * f; x -= Math.cos(v.a) * back; y -= Math.sin(v.a) * back;
  }
  if (run && dirt && !lo && v.spd > 8) {
    v.dq += dt * v.spd / 60 * (fxq.level === 3 ? 7 : 4) * Q.dens;
    if (v.dq >= 1) {
      v.dq = Math.min(1, v.dq - 1);
      const c = Math.cos(v.a), s = Math.sin(v.a), hl = u.builder ? 9 : CHASSIS[u.d.c].size[0] / 2, side = (Math.random() - 0.5) * (u.builder ? 10 : CHASSIS[u.d.c].size[1]);
      vdust(x - c * hl - s * side, y - s * hl + c * side, -c * 12 + (Math.random() - 0.5) * 10, -s * 12 + (Math.random() - 0.5) * 10 - 3, 0.7 + Math.random() * 0.4, 1.8 + Math.random() * 1.4);
    }
  }
  const sc = TF[0], ex = sc * x + TF[1], ey = sc * y + TF[2], ca = Math.cos(v.a), sa = Math.sin(v.a);
  if (u.builder) {
    const h = truckSprite(u.owner, v.a, k, Q.aq, night);
    g.setTransform(ca * sc, sa * sc, -sa * sc, ca * sc, ex, ey); g.drawImage(h.c, h.x, h.y, h.w, h.h);
    g.translate(-5, 0); truckArm(g, u.owner, u.working && !rm ? Math.sin(t * 4) * 0.7 : 0.25);
  } else {
    // beccheggio: lo scafo si accorcia o si allunga appena, la torretta scivola avanti o indietro
    const pz = lo ? 0 : v.pitch, hs = 1 + pz * 0.04;
    const h = hullSprite(u.d, u.owner, v.a, v.dist, k, Q.aq, night);
    g.setTransform(ca * sc * hs, sa * sc * hs, -sa * sc, ca * sc, ex, ey); g.drawImage(h.c, h.x, h.y, h.w, h.h);
    const rec = recoil(u.id, ct), tc = Math.cos(u.tang), ts = Math.sin(u.tang), pd = pz * 1.1;
    const w = turretSprite(u.d.w, u.d.c, u.owner, u.tang, k, Q.aq, night);
    g.setTransform(tc * sc, ts * sc, -ts * sc, tc * sc, ex + sc * (ca * pd - tc * rec), ey + sc * (sa * pd - ts * rec)); g.drawImage(w.c, w.x, w.y, w.w, w.h);
  }
  g.globalAlpha = 1;
}
// Proiettili: granate (parabola con l'ombra che si allarga, scia), colpi di cannone (scia luminosa), missili e razzi.
function drawProj(g, inView) {
  for (const p of proj) {
    if (!inView(p.x, p.y - (p.h || 0), 40)) continue;
    if (p.k === 'mortar') {
      if (!vis[ftile(p.x) + ftile(p.y) * MW] && p.owner !== P) continue;
      if (p.wk === 'HW') {
        const hk = Math.min(1, p.h / 110);
        g.fillStyle = `rgba(0,0,0,${0.4 - 0.22 * hk})`; g.beginPath(); g.arc(p.x, p.y, 2.6 + 3 * hk, 0, 7); g.fill();
        drawTrail(g, p, p.x, p.y - p.h, 'rgba(225,220,200,', 1.6, 18);
        g.fillStyle = '#25241f'; g.beginPath(); g.arc(p.x, p.y - p.h, 3.4, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,240,200,0.35)'; g.beginPath(); g.arc(p.x - 1, p.y - p.h - 1, 1.2, 0, 7); g.fill();
      } else {
        const hk = Math.min(1, (p.h || 0) / 90);
        g.fillStyle = `rgba(0,0,0,${0.4 - 0.2 * hk})`; g.beginPath(); g.arc(p.x, p.y, 2.5 + 2 * hk, 0, 7); g.fill();
        g.fillStyle = '#25241f'; g.beginPath(); g.arc(p.x, p.y - p.h, 3, 0, 7); g.fill();
        g.fillStyle = 'rgba(255,240,200,0.4)'; g.beginPath(); g.arc(p.x - 1, p.y - p.h - 1, 1.1, 0, 7); g.fill();
      }
    } else if (p.k === 'shell') {
      const r = p.wk === 'CN105' ? 2.6 : p.wk === 'CN75' ? 2.3 : 2, c = Math.cos(p.a || 0), s = Math.sin(p.a || 0);
      g.strokeStyle = 'rgba(255,230,170,0.6)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - c * 9, p.y - s * 9); g.stroke();
      g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
    } else if (p.k === 'missile') {
      // missile filoguidato: scia sottile e chiara, corpo con alette, fiamma del motore
      drawTrail(g, p, p.x, p.y, 'rgba(235,232,215,', 1, 16);
      at(g, p.x, p.y, p.a);
      g.fillStyle = '#ffb347'; g.beginPath(); g.moveTo(-5, -1); g.lineTo(-9 - Math.random() * 3, 0); g.lineTo(-5, 1); g.closePath(); g.fill();
      g.fillStyle = '#8f8a74'; g.fillRect(-5, -2.4, 2, 4.8);
      g.fillStyle = '#e4e0cc'; g.fillRect(-5, -1.2, 9, 2.4); g.fillStyle = '#b4472c'; g.beginPath(); g.moveTo(4, -1.2); g.lineTo(6.5, 0); g.lineTo(4, 1.2); g.closePath(); g.fill();
      home(g);
    } else {
      const big = p.wk === 'MRL' ? 1.25 : 1;
      at(g, p.x, p.y, p.a, big); g.fillStyle = '#d9d3c0'; g.fillRect(-4, -1, 7, 2); g.fillStyle = '#ffb347'; g.fillRect(-7, -1.2, 3, 2.4); home(g);
    }
  }
}
// Scia sottile di un proiettile: gli ultimi punti del suo percorso, sempre più trasparenti verso la coda.
const trails = new WeakMap();
function drawTrail(g, p, x, y, rgb, lw, max) {
  let pts = trails.get(p);
  if (!pts) { pts = []; trails.set(p, pts); }
  const l = pts[pts.length - 1];
  if (!l || Math.abs(l[0] - x) + Math.abs(l[1] - y) > 3) { pts.push([x, y]); if (pts.length > max) pts.shift(); }
  // tre tratti di trasparenza crescente verso la testa: pochi stroke anche con molti colpi in volo
  g.lineWidth = lw; const n = pts.length;
  for (let b = 0; b < 3; b++) {
    const i0 = Math.floor(b * (n - 1) / 3), i1 = b === 2 ? n - 1 : Math.floor((b + 1) * (n - 1) / 3); if (i1 <= i0 && b < 2) continue;
    g.strokeStyle = rgb + (0.18 * (b + 1)).toFixed(2) + ')'; g.beginPath(); g.moveTo(pts[i0][0], pts[i0][1]);
    for (let i = i0 + 1; i <= i1; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (b === 2) g.lineTo(x, y);
    g.stroke();
  }
}
// Giacimenti liberi: chiazza di petrolio con i riflessi e una bolla che sale.
function drawDeposits(g, inView, t) {
  for (const d of deposits) {
    const i = d.x + d.y * MW; if (occ[i]) continue;
    const cx = (d.x + 0.5) * TILE, cy = (d.y + 0.5) * TILE; if (!inView(cx, cy, 30)) continue;
    g.fillStyle = 'rgba(16,13,10,0.92)'; g.beginPath(); g.ellipse(cx, cy, 12, 9.5, 0.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(110,90,150,0.25)'; g.beginPath(); g.ellipse(cx - 2, cy - 1, 7, 4, 0.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(80,160,150,0.18)'; g.beginPath(); g.ellipse(cx + 2, cy + 1, 5, 2.5, 0.4, 0, 7); g.fill();
    const b = (t * 0.7 + d.x * 0.37) % 1; g.strokeStyle = `rgba(200,190,160,${0.4 * (1 - b)})`; g.lineWidth = 1; g.beginPath(); g.arc(cx + 3, cy + 1, 1 + b * 4, 0, 7); g.stroke();
  }
}

// Segno dell'ordine: quattro frecce che si stringono sul punto, poi svaniscono.
function drawMark(g, f, rm) {
  const sc = f.s || 1, k = f.life / f.max, p = 1 - k, e = 1 - (1 - Math.min(1, p / 0.55)) ** 3, d = (rm ? 7 : 20 - 14 * e) * sc, h = 5 * sc;
  g.strokeStyle = f.c; g.lineWidth = 2 * Math.sqrt(sc); g.globalAlpha = k < 0.35 ? k / 0.35 : 1;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4, cx = f.x + Math.cos(a) * d, cy = f.y + Math.sin(a) * d;
    g.moveTo(cx + Math.cos(a + 0.75) * h, cy + Math.sin(a + 0.75) * h); g.lineTo(cx, cy); g.lineTo(cx + Math.cos(a - 0.75) * h, cy + Math.sin(a - 0.75) * h);
  }
  g.stroke();
  if (p > 0.45) { g.lineWidth = 1.5 * Math.sqrt(sc); g.beginPath(); g.arc(f.x, f.y, (2 + 6 * (p - 0.45)) * sc, 0, 7); g.stroke(); }
  g.globalAlpha = 1;
}
export function hpColor(f) { return f > 0.6 ? '#93a85c' : f > 0.3 ? '#e2b84a' : '#d0533f'; }
function bar(g, x, y, w, f) {
  g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - 1, y - 1, w + 2, 5);
  g.fillStyle = hpColor(f); g.fillRect(x, y, w * clamp(f, 0, 1), 3);
}
// In media e bassa qualità le barre dei mezzi si raccolgono e si disegnano con quattro riempimenti in tutto.
const barBg = [], barCol = new Map();
function barLater(x, y, w, f) {
  barBg.push(x - 1, y - 1, w + 2, 5);
  const c = hpColor(f); let a = barCol.get(c); if (!a) barCol.set(c, a = []);
  a.push(x, y, w * clamp(f, 0, 1), 3);
}
function fillRects(g, style, a) {
  if (!a.length) return;
  g.fillStyle = style; g.beginPath();
  for (let i = 0; i < a.length; i += 4) g.rect(a[i], a[i + 1], a[i + 2], a[i + 3]);
  g.fill(); a.length = 0;
}
function bracketPath(g, x, y, w, h) {
  const l = Math.min(6, w / 3);
  g.moveTo(x, y + l); g.lineTo(x, y); g.lineTo(x + l, y); g.moveTo(x + w - l, y); g.lineTo(x + w, y); g.lineTo(x + w, y + l);
  g.moveTo(x + w, y + h - l); g.lineTo(x + w, y + h); g.lineTo(x + w - l, y + h); g.moveTo(x + l, y + h); g.lineTo(x, y + h); g.lineTo(x, y + h - l);
}
// Angoli di selezione degli edifici, con un bordo scuro sotto per leggerli su ogni terreno.
function brackets(g, x, y, w, h, c) {
  g.beginPath(); bracketPath(g, x, y, w, h);
  g.strokeStyle = 'rgba(8,8,6,0.6)'; g.lineWidth = 3.2; g.stroke();
  g.strokeStyle = c; g.lineWidth = 1.6; g.stroke();
}

/* ---------- fotogramma ---------- */
const burnList = [], selSet = new Set();
// Trasformazione del mondo del fotogramma [scala, scostamento x, scostamento y]: le sagome ruotate si piazzano con
// setTransform (at) e si torna al mondo con home, senza save/restore per ogni oggetto.
const TF = [1, 0, 0];
function at(g, x, y, a, k = 1) { const m = TF[0] * k, c = Math.cos(a) * m, s = Math.sin(a) * m; g.setTransform(c, s, -s, c, TF[0] * x + TF[1], TF[0] * y + TF[2]); }
const home = g => g.setTransform(TF[0], 0, 0, TF[0], TF[1], TF[2]);
let lastR = 0, slow = 0;
const selRing = [[], []], selBr = [[], []], seenUnits = [], seenStructs = [];
export function render(now) {
  const t = now / 1000, ct = clock(), g = ctx, z = cam.z, { dpr, cw, ch } = view, rm = reducedMotion(), Q = fxq.q, lvl = fxq.level;
  const dt = Math.min(0.05, Math.max(0, (now - lastR) / 1000)), run = !ui.paused && !ui.overlay;
  lastR = now;
  // stato della tela da capo: un fotogramma interrotto da un errore non deve lasciare trasparenze o fusioni
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = '#0c0e0d'; g.fillRect(0, 0, cv.width, cv.height);
  if (!S || !mmBase) return;
  pumpTerrain(); spriteFrame();
  const night = !!S.night, lightOn = night && Q.light, tinted = night && !lightOn;
  const sh = shakeAllowed() ? fxs.shake : 0, ox = sh ? (Math.random() - 0.5) * 2 * sh : 0, oy = sh ? (Math.random() - 0.5) * 2 * sh : 0;
  TF[0] = dpr * z; TF[1] = (-cam.x * z + ox) * dpr; TF[2] = (-cam.y * z + oy) * dpr; home(g);
  const vw = cw / z, vh = ch / z, vr = { x0: cam.x, y0: cam.y, x1: cam.x + vw, y1: cam.y + vh };
  const x0 = Math.max(0, cam.x), y0 = Math.max(0, cam.y), x1 = Math.min(MW * TILE, cam.x + vw), y1 = Math.min(MH * TILE, cam.y + vh);
  const inView = (x, y, m) => x > cam.x - m && x < cam.x + vw + m && y > cam.y - m && y < cam.y + vh + m;
  const k = Math.ceil(dpr * z * 4) / 4;
  // 1. terreno, segni, acqua, giacimenti (da vicino il terreno si copia senza sfumare, più veloce, come prima)
  g.imageSmoothingEnabled = z < 1 || lvl >= 2;
  slow = slow + ((dt > 0.025 ? 1 : 0) - slow) * 0.1; // quota di fotogrammi lunghi, media mobile
  const drawn = drawTerrain(g, vr, variant(), slow > 0.5);
  if (tinted && drawn.undark.length) {
    // pezzi di giorno ancora in uso con la notte senza tela della luce: la tinta della luna sopra, finché arrivano
    g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgb(${NIGHT.bake})`;
    for (let i = 0; i < drawn.undark.length; i += 2) g.fillRect(drawn.undark[i] * CHUNK, drawn.undark[i + 1] * CHUNK, CHUNK, CHUNK);
    g.globalCompositeOperation = 'source-over';
  }
  g.imageSmoothingEnabled = true;
  drawDecals(g, x0, y0, x1, y1);
  if (Q.water) drawWater(g, cv, TF, vr, rm ? 0 : ct, Q.water);
  drawDeposits(g, inView, rm ? 0 : t);
  // 2. edifici (ombre, macerie, relitti, corpi), alberi vivi
  seenStructs.length = 0;
  for (const e of S.ents) if (e.kind === 'struct' && !e.dead && (e.owner === P || e.seen) && inView(e.x, e.y, 110)) seenStructs.push(e);
  for (const e of seenStructs) structShadow(g, e);
  const so = { t, now: ct, k, aq: Q.aq, night: tinted, tinted, rm };
  for (const r of ruins) if (inView(r.x, r.y, 110)) drawRuin(g, r, so);
  for (const w of fxs.wrecks) if (inView(w.x, w.y, 40)) drawWreck(g, w, t, TF, lvl === 0);
  burnList.length = 0;
  for (const e of seenStructs) {
    const st = fxs.settle.get(e.id), a = st ? ct - st.t0 : 9;
    if (a < 0.45) {
      // edificio che si posa: scende dall'alto e si assesta
      const kk = Math.max(0, a / 0.45), off = rm ? 0 : -16 * (1 - kk) * (1 - kk), sc = rm ? 1 : 1 + 0.12 * (1 - kk);
      if (a >= 0.3 && !st.dust) { st.dust = true; if (e.owner === P || canSee(P, e)) dust(e.x, e.y, e.w * TILE * 0.45, rm ? 2 : 7); }
      g.save(); g.globalAlpha = 0.35 + 0.65 * kk; g.translate(e.x, e.y + off); g.scale(sc, sc); g.translate(-e.x, -e.y);
      drawStruct(g, e, so); g.restore(); g.globalAlpha = 1;
    } else drawStruct(g, e, so);
    if (e.hp < e.max * 0.25 && e.built >= 1 && (e.owner === P || canSee(P, e))) burnList.push(e);
  }
  if (!night) for (const e of seenStructs) if (e.built >= 1) for (const [x, y, a, c] of beacons(e, t)) { g.globalAlpha = 0.4 + 0.6 * a; g.fillStyle = c; g.beginPath(); g.arc(x, y, 1.3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  if (drawn.bare.size) drawTrees(g, vr, ct, fxs.fx, rm);
  // mezzi in vista (con la posizione disegnata del fotogramma prima, per la luce)
  seenUnits.length = 0;
  for (const e of S.ents) if (e.kind === 'unit' && !e.dead && inView(e.x, e.y, 30) && canSee(P, e)) seenUnits.push(e);
  // 3. notte: il mondo fin qui per la tela della luce (fari, lampade, finestre, fuochi)
  if (lightOn) {
    const units = seenUnits.map(u => { const v = poseOf(u.id); return { u, x: v ? v.x : u.x, y: v ? v.y : u.y, a: v ? v.a : u.ang }; });
    nightLight(g, cv, { units, structs: seenStructs, fx: fxs.fx, wrecks: fxs.wrecks, ruins, parts: fxs.parts, proj, burning: burnList, t, vr, tf: TF });
    home(g);
  }
  // 4. punti di raduno, anelli di selezione, mezzi, proiettili
  for (const id of ui.sel) {
    const s = ent(id);
    if (s && s.kind === 'struct' && s.owner === P && s.rally) {
      g.setLineDash([5, 5]); g.strokeStyle = 'rgba(240,194,122,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.rally[0], s.rally[1]); g.stroke(); g.setLineDash([]);
      g.fillStyle = '#f0c27a'; g.fillRect(s.rally[0], s.rally[1] - 12, 1.5, 12); g.beginPath(); g.moveTo(s.rally[0] + 1.5, s.rally[1] - 12); g.lineTo(s.rally[0] + 9, s.rally[1] - 9); g.lineTo(s.rally[0] + 1.5, s.rally[1] - 6); g.fill();
    } else if (s && s.kind === 'unit' && !s.dead && inView(s.x, s.y, 30) && canSee(P, s)) {
      const v = poseOf(s.id); selRing[s.owner === P ? 0 : 1].push(v ? v.x : s.x, v ? v.y : s.y, s.rad);
    }
  }
  // anelli di selezione sotto i mezzi, tutti insieme: disco tenue, bordo scuro e anello chiaro che pulsa
  const pu = rm ? 0 : Math.sin(t * 5);
  for (let o = 0; o < 2; o++) {
    const a = selRing[o]; if (!a.length) continue;
    g.beginPath();
    for (let i = 0; i < a.length; i += 3) { const r = a[i + 2] + 5 + pu * 1.2; g.moveTo(a[i] + r, a[i + 1] + 1); g.ellipse(a[i], a[i + 1] + 1, r, r * 0.82, 0, 0, 7); }
    g.fillStyle = o ? 'rgba(231,154,143,0.14)' : 'rgba(242,230,201,0.14)'; g.fill();
    g.strokeStyle = 'rgba(8,8,6,0.55)'; g.lineWidth = 3.4; g.stroke();
    g.strokeStyle = o ? '#e79a8f' : '#f2e6c9'; g.globalAlpha = 0.8 + 0.2 * pu; g.lineWidth = 1.6; g.stroke(); g.globalAlpha = 1;
    a.length = 0;
  }
  for (const e of seenUnits) {
    drawUnit(g, e, t, ct, k, dt, Q, rm, run, night);
    if (e.hp < e.max * 0.25) burnList.push(e);
  }
  home(g);
  drawProj(g, inView);
  // 5. fumo e polvere, poi fuoco e luci additive
  drawSmoke(g, inView, night);
  drawHot(g, inView, t, burnList, Q.glow, at, home);
  if (night) {
    // finestre accese, luci di segnalazione e fari a piena luce
    g.globalCompositeOperation = 'lighter';
    for (const e of seenStructs) {
      if (e.built < 1) continue; const sx = e.tx * TILE, sy = e.ty * TILE;
      for (const [a, b, c2, d] of WINDOWS[e.type] || []) { g.globalAlpha = 0.85; g.fillStyle = '#ffd890'; g.fillRect(sx + a, sy + b, c2, d); glow(g, sx + a + c2 / 2, sy + b + d / 2, 10, 0.35, LAMP); }
      for (const [x, y, a, c] of beacons(e, t)) { g.globalAlpha = a; g.fillStyle = c; g.beginPath(); g.arc(x, y, 1.4, 0, 7); g.fill(); glow(g, x, y, 8, a * 0.7, c === '#ff5040' ? RED : LAMP); }
    }
    for (const e of seenUnits) {
      if (e.owner !== P) continue;
      const v = poseOf(e.id), L = e.builder ? 20 : CHASSIS[e.d.c].size[0], W = e.builder ? 10 : CHASSIS[e.d.c].size[1], c = Math.cos(v ? v.a : e.ang), s = Math.sin(v ? v.a : e.ang), ux = v ? v.x : e.x, uy = v ? v.y : e.y;
      for (const sd of [-1, 1]) glow(g, ux + c * L / 2 - s * sd * W * 0.35, uy + s * L / 2 + c * sd * W * 0.35, 4, 0.8, GLOW_W);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  // 6. nuvole e colore (di giorno), nebbia
  if (!night && Q.clouds && !rm) drawClouds(g, vr, ct);
  if (!night && Q.grade) { grade(g, cv); home(g); }
  g.imageSmoothingEnabled = true;
  drawFog(g);
  for (const f of fxs.fx) if (f.k === 'mark') drawMark(g, f, rm);
  // nomi dei luoghi delle mappe disegnate: sopra la nebbia, sotto barre e selezioni; solo da vicino
  if (S.map && placesOn()) { const pl = placesOf(S.map); if (pl) { drawPlaces(g, pl, cam, z, dpr, cw, ch, (x, y) => explored[x + y * MW] === 1); home(g); } }
  // 7. barre della salute, angoli di selezione, piazzamento, riquadro
  selSet.clear(); for (const id of ui.sel) selSet.add(id);
  const batchBars = lvl < 3;
  for (const e of S.ents) {
    if (e.dead || !inView(e.x, e.y, e.kind === 'unit' ? 30 : 100)) continue;
    const isSel = selSet.has(e.id);
    if (e.owner !== P && !canSee(P, e)) continue;
    if (!isSel && e.hp >= e.max && (e.kind !== 'struct' || e.built >= 1)) continue;
    if (e.kind === 'unit') {
      const r = e.rad + 4, v = poseOf(e.id), x = v ? v.x : e.x, y = v ? v.y : e.y;
      if (isSel) selBr[e.owner === P ? 0 : 1].push(x - r, y - r, r * 2);
      if (batchBars) barLater(x - 11, y - r - 6, 22, e.hp / e.max); else bar(g, x - 11, y - r - 6, 22, e.hp / e.max);
    } else {
      const xs = e.tx * TILE, ys = e.ty * TILE, w = e.w * TILE, h = e.h * TILE;
      if (isSel) brackets(g, xs + 1, ys + 1, w - 2, h - 2, e.owner === P ? '#f2e6c9' : '#e79a8f');
      bar(g, xs + 6, ys - 6, w - 12, e.hp / e.max);
      if (e.built < 1) { g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(xs + 6, ys + h + 2, w - 12, 4); g.fillStyle = '#f0c27a'; g.fillRect(xs + 6, ys + h + 2, (w - 12) * e.built, 3); }
    }
  }
  for (let o = 0; o < 2; o++) {
    const a = selBr[o]; if (!a.length) continue;
    g.beginPath(); for (let i = 0; i < a.length; i += 3) bracketPath(g, a[i], a[i + 1], a[i + 2], a[i + 2]);
    g.strokeStyle = 'rgba(8,8,6,0.6)'; g.lineWidth = 3.4; g.stroke();
    g.strokeStyle = o ? '#e79a8f' : '#f2e6c9'; g.lineWidth = 1.7; g.stroke();
    a.length = 0;
  }
  if (batchBars) { fillRects(g, 'rgba(0,0,0,0.65)', barBg); for (const [c, a] of barCol) fillRects(g, c, a); }
  if (ui.placing && hover.in) {
    const D = STRUCTS[ui.placing], w = screenToWorld(hover.x, hover.y);
    const tx = Math.floor(w.x / TILE - D.w / 2 + 0.5), ty = Math.floor(w.y / TILE - D.h / 2 + 0.5);
    const ok = canPlace(P, ui.placing, tx, ty) && S.res[P] >= D.cost;
    g.fillStyle = ok ? 'rgba(147,200,110,0.32)' : 'rgba(210,80,60,0.35)'; g.fillRect(tx * TILE, ty * TILE, D.w * TILE, D.h * TILE);
    g.strokeStyle = ok ? '#b8dc8c' : '#e07a66'; g.lineWidth = 1.5; g.strokeRect(tx * TILE + 0.5, ty * TILE + 0.5, D.w * TILE - 1, D.h * TILE - 1);
    if (ui.placing === 'pump') for (const d of deposits) if (!occ[d.x + d.y * MW] && explored[d.x + d.y * MW]) { g.strokeStyle = 'rgba(240,194,122,0.7)'; g.setLineDash([3, 3]); g.strokeRect(d.x * TILE + 2, d.y * TILE + 2, TILE - 4, TILE - 4); g.setLineDash([]); }
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const b = fxs.boxSel;
  if (b) {
    const x = Math.min(b.sx, b.x), y = Math.min(b.sy, b.y), w = Math.abs(b.x - b.sx), h = Math.abs(b.y - b.sy);
    // tocco lungo appena riconosciuto: anello sotto il dito, «ora trascina per il riquadro»
    if (b.long) { g.strokeStyle = 'rgba(240,194,122,0.85)'; g.lineWidth = 2; g.beginPath(); g.arc(b.sx, b.sy, 24, 0, 7); g.stroke(); }
    g.fillStyle = 'rgba(240,194,122,0.08)'; g.fillRect(x, y, w, h); g.strokeStyle = '#f0c27a'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  // scritta d'aiuto in alto a sinistra solo sul computer: nella disposizione B quell'angolo è della striscia delle
  // risorse, e attacca-muovi e piazzamento hanno il loro segnale sul pulsante e nella barra del piazzamento
  if (layout.b) return;
  g.font = '600 12px "IBM Plex Sans Condensed", sans-serif';
  if (ui.amove) { g.fillStyle = 'rgba(17,20,18,0.85)'; g.fillRect(8, 8, 206, 24); g.fillStyle = '#e79a8f'; g.fillText('Attacca-muovi: scegli la destinazione', 16, 24); }
  else if (ui.placing) { g.fillStyle = 'rgba(17,20,18,0.85)'; g.fillRect(8, 8, 246, 24); g.fillStyle = '#f0c27a'; g.fillText(`${STRUCTS[ui.placing].name}: scegli il punto (Esc annulla)`, 16, 24); }
}

// Nebbia: solo il rettangolo di caselle coperte vicino alla visuale (più una casella di margine, così la sfumatura
// resta identica); se tutta la visuale è in vista non si disegna niente.
function drawFog(g) {
  const d = fogImg.data, vw = view.cw / cam.z, vh = view.ch / cam.z;
  const tx0 = Math.max(0, Math.floor(cam.x / TILE) - 2), ty0 = Math.max(0, Math.floor(cam.y / TILE) - 2);
  const tx1 = Math.min(MW - 1, Math.floor((cam.x + vw) / TILE) + 2), ty1 = Math.min(MH - 1, Math.floor((cam.y + vh) / TILE) + 2);
  let bx0 = MW, by0 = MH, bx1 = -1, by1 = -1;
  for (let y = ty0; y <= ty1; y++) for (let x = tx0, i = (y * MW + tx0) * 4 + 3; x <= tx1; x++, i += 4) {
    if (!d[i]) continue;
    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
  }
  if (bx1 < 0) return;
  bx0 = Math.max(0, bx0 - 1); by0 = Math.max(0, by0 - 1); bx1 = Math.min(MW - 1, bx1 + 1); by1 = Math.min(MH - 1, by1 + 1);
  const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
  g.drawImage(fogC, bx0, by0, w, h, bx0 * TILE, by0 * TILE, w * TILE, h * TILE);
}
// Carta della missione per il briefing: terreno e giacimenti della mappa già calcolata dal motore, edifici dei due
// lati senza nebbia, cerchi sulle basi e frecce sui punti d'ingresso delle ondate da fuori mappa.
export function drawMissionMap(c) {
  if (!S || !terr) return;
  const sc = Math.max(2, Math.floor(c.width / MW)), W = MW * sc, H = MH * sc;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(MW, MH);
  terrainImage(img);
  const tmp = document.createElement('canvas'); tmp.width = MW; tmp.height = MH; tmp.getContext('2d').putImageData(img, 0, 0);
  g.imageSmoothingEnabled = false; g.drawImage(tmp, 0, 0, W, H);
  g.fillStyle = 'rgba(17,20,18,0.18)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(235,228,200,0.16)'; g.lineWidth = 1;
  for (let i = 1; i < 8; i++) { const p = Math.round(i * W / 8) + 0.5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, H); g.moveTo(0, p); g.lineTo(W, p); g.stroke(); }
  g.fillStyle = '#1a1712';
  for (const d of deposits) { g.beginPath(); g.arc((d.x + 0.5) * sc, (d.y + 0.5) * sc, sc * 0.55, 0, 7); g.fill(); }
  for (const e of S.ents) {
    if (e.dead || e.kind !== 'struct') continue;
    g.fillStyle = PAL[e.owner].dot; g.fillRect(e.tx * sc, e.ty * sc, e.w * sc, e.h * sc);
  }
  const ring = (x, y, col, label) => {
    g.strokeStyle = col; g.lineWidth = Math.max(2, sc * 0.5); g.setLineDash([sc * 1.4, sc]);
    g.beginPath(); g.arc(x, y, sc * 7, 0, 7); g.stroke(); g.setLineDash([]);
    g.font = `600 ${Math.max(11, sc * 3)}px "IBM Plex Sans Condensed", sans-serif`; g.textAlign = 'center';
    const ty = y - sc * 8.2 < 12 ? y + sc * 10.5 : y - sc * 8.2;
    g.lineWidth = 3; g.strokeStyle = 'rgba(10,12,11,0.85)'; g.strokeText(label, x, ty); g.fillStyle = col; g.fillText(label, x, ty);
  };
  const hq = S.ents.find(e => !e.dead && e.owner === P && e.type === 'hq');
  if (hq) ring(hq.x / TILE * sc, hq.y / TILE * sc, PAL[P].light, 'Brigata Aurora');
  const bases = S.ents.filter(e => !e.dead && e.owner !== P && e.type === 'hq');
  for (const b of bases) ring(b.x / TILE * sc, b.y / TILE * sc, PAL[1].light, 'Direttorio');
  // ondate da fuori mappa: freccia rivolta verso l'interno sul bordo d'ingresso
  for (const [x, y] of (S.ai && S.ai.spawns) || []) {
    const px = (x + 0.5) * sc, py = (y + 0.5) * sc, a = Math.atan2(MH / 2 * sc - py, MW / 2 * sc - px);
    const L = sc * 5;
    g.fillStyle = PAL[1].light; g.beginPath();
    g.moveTo(px + Math.cos(a) * L, py + Math.sin(a) * L);
    g.lineTo(px + Math.cos(a + 2.5) * L * 0.6, py + Math.sin(a + 2.5) * L * 0.6);
    g.lineTo(px + Math.cos(a - 2.5) * L * 0.6, py + Math.sin(a - 2.5) * L * 0.6);
    g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(235,228,200,0.45)'; g.font = `500 ${Math.max(9, sc * 2.2)}px "IBM Plex Mono", monospace`; g.textAlign = 'left';
  for (let gy = 0; gy < 8; gy++) for (let gx = 0; gx < 8; gx++) if (!gx || !gy) g.fillText('ABCDEFGH'[gx] + (gy + 1), gx * W / 8 + 3, gy * H / 8 + sc * 2.6);
}
export function renderMini() {
  if (!S || !mmBase) return;
  const g = mctx, W = mini.width, H = mini.height, sx = W / MW, sy = H / MH;
  g.imageSmoothingEnabled = false; g.drawImage(mmBase, 0, 0, W, H);
  g.imageSmoothingEnabled = true; g.drawImage(fogC, 0, 0, W, H);
  for (const e of S.ents) {
    if (e.dead) continue;
    if (e.kind === 'struct') { if (e.owner !== P && !e.seen) continue; g.fillStyle = PAL[e.owner].dot; g.fillRect(e.tx * sx, e.ty * sy, Math.max(2, e.w * sx), Math.max(2, e.h * sy)); }
    else { if (!canSee(P, e)) continue; g.fillStyle = e.owner === P ? '#f6dca8' : '#ff6f5f'; g.fillRect(e.x / TILE * sx - 1.5, e.y / TILE * sy - 1.5, 3, 3); }
  }
  g.strokeStyle = 'rgba(235,228,200,0.18)'; g.lineWidth = 1;
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i * W / 8, 0); g.lineTo(i * W / 8, H); g.moveTo(0, i * H / 8); g.lineTo(W, i * H / 8); g.stroke(); }
  // un segnale vale 4 s; età negativa o non numerica (segnale rimasto da un'altra partita) → scartato
  const pingOk = p => { const a = S.time - p.t; return Number.isFinite(a) && a >= 0 && a < 4 && Number.isFinite(p.x) && Number.isFinite(p.y); };
  fxs.pings = fxs.pings.filter(pingOk);
  for (const p of fxs.pings) { const k = ((S.time - p.t) * 1.5) % 1; g.strokeStyle = `rgba(224,86,74,${1 - k})`; g.lineWidth = 2; g.beginPath(); g.arc(p.x / TILE * sx, p.y / TILE * sy, 4 + k * 12, 0, 7); g.stroke(); }
  g.strokeStyle = '#f2e6c9'; g.lineWidth = 1.5;
  g.strokeRect(cam.x / TILE * sx, cam.y / TILE * sy, view.cw / cam.z / TILE * sx, view.ch / cam.z / TILE * sy);
}

