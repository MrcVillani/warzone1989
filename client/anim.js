// Animazioni del solo disegno, calcolate dallo stato e dagli eventi del motore senza modificarli: assetto dei mezzi
// (posizione ammorbidita, sterzata, beccheggio, cingoli), rinculo delle armi, porte delle fabbriche, cantieri con la
// gru, palle di fuoco delle esplosioni e macerie degli edifici crollati.
import { TILE, CHASSIS, angDiff, mulberry32 } from '../engine/index.js';

/* ---------- assetto dei mezzi ---------- */
// Il motore muove i mezzi a velocità costante: qui la posizione disegnata segue quella vera con una molla
// smorzata (partenza e frenata morbide), senza mai staccarsene più di MAXLAG pixel.
const MAXLAG = 4, W0 = 9, MAXTURN = 0.35;
const poses = new Map();
export const poseOf = id => poses.get(id);
// u: mezzo; dt: secondi dal fotogramma prima; now: orologio in secondi; bob: ampiezza del beccheggio da terreno
// (0 = niente); rm: «riduci movimento».
export function unitPose(u, dt, now, bob, rm) {
  let v = poses.get(u.id);
  const far = v && ((u.x - v.x) ** 2 + (u.y - v.y) ** 2 > 576 || now - v.seen > 0.3);
  if (!v || far) {
    v = { x: u.x, y: u.y, vx: 0, vy: 0, a: u.ang, spd: 0, acc: 0, dist: v ? v.dist : 0, pitch: 0, pv: 0, seen: now, dq: 0 };
    poses.set(u.id, v);
    return v;
  }
  v.seen = now;
  if (!(dt > 0)) return v;
  const ox = v.x, oy = v.y, n = dt > 0.02 ? 3 : 1, h = dt / n;
  for (let i = 0; i < n; i++) {
    v.vx += (-W0 * W0 * (v.x - u.x) - 2 * W0 * v.vx) * h; v.vy += (-W0 * W0 * (v.y - u.y) - 2 * W0 * v.vy) * h;
    v.x += v.vx * h; v.y += v.vy * h;
  }
  const ex = v.x - u.x, ey = v.y - u.y, e2 = ex * ex + ey * ey;
  if (e2 > MAXLAG * MAXLAG) {
    const f = MAXLAG / Math.sqrt(e2); v.x = u.x + ex * f; v.y = u.y + ey * f;
    v.vx = (v.x - ox) / dt; v.vy = (v.y - oy) / dt;
  } else if (e2 < 0.0004 && v.vx * v.vx + v.vy * v.vy < 0.01) { v.x = u.x; v.y = u.y; v.vx = v.vy = 0; }
  const spd = Math.hypot(v.x - ox, v.y - oy) / dt;
  v.acc += ((spd - v.spd) / dt - v.acc) * Math.min(1, dt * 10);
  v.spd = spd; v.dist += spd * dt;
  // sterzata: lo scafo disegnato insegue l'angolo vero con una curva morbida
  const da = angDiff(v.a, u.ang);
  v.a += da * Math.min(1, dt * 11);
  const left = angDiff(v.a, u.ang);
  if (left > MAXTURN) v.a = u.ang - MAXTURN; else if (left < -MAXTURN) v.a = u.ang + MAXTURN;
  if (rm) { v.pitch = v.pv = 0; return v; }
  // beccheggio: il muso si abbassa in frenata e si alza in partenza (molla poco smorzata, oscilla un poco);
  // sullo sterrato in più un dondolio che segue la strada fatta
  let tgt = Math.max(-1, Math.min(1, -v.acc / 260));
  if (bob && spd > 4) tgt += Math.sin(v.dist * 0.42 + u.id) * bob * Math.min(1, spd / 35);
  v.pv += ((tgt - v.pitch) * 240 - v.pv * 9) * dt;
  v.pitch += v.pv * dt;
  if (!(Math.abs(v.pitch) < 3)) v.pitch = v.pv = 0;
  return v;
}

/* ---------- rinculo ---------- */
// Arretramento della torretta in pixel del mondo, per arma (0 = nessuno).
export const RECOIL = { MG: 0.7, HMG: 1.1, CN: 2, CN75: 2.4, CN105: 3, HW: 3.4, RK: 1, AT: 1, MRL: 1.6, MO: 1.8, FL: 0.2, RP: 0 };
const kicks = new Map();
export function kick(id, amp, now) { if (amp > 0) kicks.set(id, { t0: now, amp }); }
// Scatto indietro immediato, ritorno morbido in un quarto di secondo.
export function recoil(id, now) {
  const r = kicks.get(id); if (!r) return 0;
  const a = now - r.t0; if (a > 0.26 || a < 0) { kicks.delete(id); return 0; }
  if (a < 0.03) return r.amp * a / 0.03;
  const k = 1 - (a - 0.03) / 0.23; return r.amp * k * k;
}

/* ---------- porte delle fabbriche ---------- */
const doors = new Map();
// Un mezzo che esce mentre la porta è già aperta la tiene aperta; se si sta chiudendo, si riapre da dove è.
export function openDoor(id, now) {
  const t0 = doors.get(id), a = t0 == null ? 9 : now - t0;
  if (a < 0.25) return;
  const k = a <= 1.1 ? 1 : a < 1.6 ? 1 - (a - 1.1) / 0.5 : 0;
  doors.set(id, now - 0.25 * k);
}
// Apertura da 0 a 1: si apre in 0,25 s, resta aperta, si richiude in mezzo secondo.
export function doorOpen(id, now) {
  const t0 = doors.get(id); if (t0 == null) return 0;
  const a = now - t0; if (a > 1.6 || a < 0) { doors.delete(id); return 0; }
  const k = a < 0.25 ? a / 0.25 : a < 1.1 ? 1 : 1 - (a - 1.1) / 0.5;
  return k * k * (3 - 2 * k);
}

/* ---------- cantiere ---------- */
// Impalcatura lungo il perimetro (montanti, correnti e diagonali) e gru a torre in un angolo che ruota avanti e
// indietro finché il cantiere avanza; ferma se i lavori sono fermi.
const cranes = new Map();
const SCAF = 'rgba(214,198,150,0.78)', POLE = '#3d3a30', CRANE = '#d8b347', CRANE_D = '#7a6223';
export function drawSite(g, s, x0, y0, w, h, t, now, rm) {
  // impalcatura: due correnti attorno all'edificio con i montanti ogni 8 px e le diagonali tra l'uno e l'altro
  const a = 1.5, b = 4.5;
  g.strokeStyle = SCAF; g.lineWidth = 0.9;
  g.strokeRect(x0 + a, y0 + a, w - 2 * a, h - 2 * a); g.strokeRect(x0 + b, y0 + b, w - 2 * b, h - 2 * b);
  g.beginPath();
  for (let x = x0 + a, i = 0; x < x0 + w - a - 1; x += 8, i++) {
    const x2 = Math.min(x + 8, x0 + w - a);
    if (i % 2) { g.moveTo(x, y0 + a); g.lineTo(x2, y0 + b); g.moveTo(x, y0 + h - a); g.lineTo(x2, y0 + h - b); }
    else { g.moveTo(x, y0 + b); g.lineTo(x2, y0 + a); g.moveTo(x, y0 + h - b); g.lineTo(x2, y0 + h - a); }
  }
  for (let y = y0 + a, i = 0; y < y0 + h - a - 1; y += 8, i++) {
    const y2 = Math.min(y + 8, y0 + h - a);
    if (i % 2) { g.moveTo(x0 + a, y); g.lineTo(x0 + b, y2); g.moveTo(x0 + w - a, y); g.lineTo(x0 + w - b, y2); }
    else { g.moveTo(x0 + b, y); g.lineTo(x0 + a, y2); g.moveTo(x0 + w - b, y); g.lineTo(x0 + w - a, y2); }
  }
  g.stroke();
  g.fillStyle = POLE;
  for (let x = x0 + a; x <= x0 + w - a + 0.1; x += 8) for (const y of [y0 + a, y0 + h - a]) g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  for (let y = y0 + a + 8; y < y0 + h - a - 1; y += 8) for (const x of [x0 + a, x0 + w - a]) g.fillRect(x - 0.8, y - 0.8, 1.6, 1.6);
  // piano di lavoro che sale con il cantiere
  const hy = y0 + h * (1 - s.built), top = Math.max(y0 + 5, Math.min(y0 + h - 5, hy));
  g.fillStyle = 'rgba(160,130,82,0.85)'; g.fillRect(x0 + 3, top - 1.2, w - 6, 2.4);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x0 + 3, top + 1.2, w - 6, 1);
  // gru: avanza quando il cantiere avanza
  let c = cranes.get(s.id);
  const mx = x0 + 7, my = y0 + 7, base = Math.atan2(y0 + h / 2 - my, x0 + w / 2 - mx);
  if (!c) { c = { b: s.built, tb: -9, last: now, a: base + 0.6 * Math.sin(s.id), dir: 1, tr: 0.6, trd: 1 }; cranes.set(s.id, c); }
  if (s.built !== c.b) { c.b = s.built; c.tb = now; }
  const dt = Math.min(0.05, Math.max(0, now - c.last)); c.last = now;
  if (!rm && now - c.tb < 0.7) {
    c.a += c.dir * 0.55 * dt; if (c.a > base + 1.1) c.dir = -1; else if (c.a < base - 1.1) c.dir = 1;
    c.tr += c.trd * 0.3 * dt; if (c.tr > 0.95) c.trd = -1; else if (c.tr < 0.35) c.trd = 1;
  }
  const L = Math.max(w, h) * 0.78 + 6, ca = Math.cos(c.a), sa = Math.sin(c.a), tx = mx + ca * L * c.tr, ty = my + sa * L * c.tr;
  // ombre del braccio e del carico appeso
  g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(mx + 4 - ca * 9, my + 5 - sa * 9); g.lineTo(mx + 4 + ca * L, my + 5 + sa * L); g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(tx + 6 - 2, ty + 8 - 2, 4, 4);
  // carico (un fascio di travi) e cavo
  g.fillStyle = '#8a6f45'; g.fillRect(tx + 1.2 - 2, ty + 2 - 1.6, 4, 3.2);
  g.strokeStyle = 'rgba(30,28,22,0.7)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + 1.2, ty + 2); g.stroke();
  // controbraccio con il contrappeso
  g.strokeStyle = CRANE_D; g.lineWidth = 1.8; g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - ca * 9, my - sa * 9); g.stroke();
  g.fillStyle = '#77736a'; g.save(); g.translate(mx - ca * 8, my - sa * 8); g.rotate(c.a); g.fillRect(-2, -2.6, 3.6, 5.2); g.restore();
  // braccio a traliccio
  const nx = -sa * 1.1, ny = ca * 1.1;
  g.strokeStyle = CRANE; g.lineWidth = 0.8; g.beginPath();
  g.moveTo(mx + nx, my + ny); g.lineTo(mx + ca * L + nx * 0.4, my + sa * L + ny * 0.4);
  g.moveTo(mx - nx, my - ny); g.lineTo(mx + ca * L - nx * 0.4, my + sa * L - ny * 0.4);
  for (let d = 0, k = 1; d < L - 2; d += 3, k = -k) { g.moveTo(mx + ca * d + nx * k, my + sa * d + ny * k); g.lineTo(mx + ca * (d + 3) - nx * k, my + sa * (d + 3) - ny * k); }
  g.stroke();
  g.fillStyle = '#2a2925'; g.fillRect(tx - 1.4, ty - 1.4, 2.8, 2.8);
  // torre e cabina
  g.fillStyle = CRANE_D; g.fillRect(mx - 2.6, my - 2.6, 5.2, 5.2);
  g.strokeStyle = CRANE; g.lineWidth = 0.6; g.beginPath(); g.moveTo(mx - 2.6, my - 2.6); g.lineTo(mx + 2.6, my + 2.6); g.moveTo(mx + 2.6, my - 2.6); g.lineTo(mx - 2.6, my + 2.6); g.stroke();
  g.fillStyle = '#e4dcc4'; g.save(); g.translate(mx, my); g.rotate(c.a); g.fillRect(0.5, 1.4, 2.6, 2.2); g.restore();
}

/* ---------- palla di fuoco ---------- */
// Sbuffi che si accendono uno dopo l'altro: lampo bianco, fiamma che si allarga e sale, poi si spegne nel fumo.
const FB_C = ['#fff6d8', '#ffd27a', '#f39237', '#c4502a', '#4a3d33'];
export function makeFireball(x, y, R, life, n) {
  const puffs = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 7, d = i ? R * (0.2 + Math.random() * 0.45) : 0;
    puffs.push(Math.cos(a) * d, Math.sin(a) * d, R * (i ? 0.45 + Math.random() * 0.35 : 0.7), i ? Math.random() * 0.3 : 0);
  }
  return { k: 'fball', x, y, R, life, max: life, puffs };
}
export function drawFireball(g, f) {
  const p = 1 - f.life / f.max, P = f.puffs;
  for (let i = 0; i < P.length; i += 4) {
    const q = (p - P[i + 3]) / 0.7; if (q < 0 || q > 1) continue;
    const e = 1 - (1 - q) * (1 - q), r = P[i + 2] * (0.35 + 0.85 * e), x = f.x + P[i] * (0.6 + 0.6 * e), y = f.y + P[i + 1] * (0.6 + 0.6 * e) - q * f.R * 0.35;
    const ci = q < 0.12 ? 0 : q < 0.3 ? 1 : q < 0.55 ? 2 : q < 0.78 ? 3 : 4;
    g.globalAlpha = ci < 4 ? 0.95 : 0.8 * (1 - (q - 0.78) / 0.22);
    g.fillStyle = FB_C[ci]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    if (ci < 3) { g.fillStyle = FB_C[ci === 0 ? 0 : ci - 1]; g.beginPath(); g.arc(x - r * 0.15, y - r * 0.15, r * 0.55, 0, 7); g.fill(); }
  }
  g.globalAlpha = 1;
}

/* ---------- macerie ---------- */
// Cumulo di macerie di un edificio crollato, disegnato una volta su una tela a parte (pezzi di muro, lamiere del
// colore del lato, travi), poi copiato finché sbiadisce.
const RUB = ['#6e6a5b', '#5a574c', '#7b776a', '#47443a', '#393630', '#2c2a25'];
export function makeRubble(s, col) {
  const w = s.w * TILE, h = s.h * TILE, m = 8, k = 2, r = mulberry32((s.id * 7919) >>> 0 || 1);
  const c = document.createElement('canvas'); c.width = (w + 2 * m) * k; c.height = (h + 2 * m) * k;
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, m * k, m * k);
  // terreno annerito e polvere chiara ai bordi
  const blob = (rx, ry, jit) => {
    g.beginPath();
    for (let i = 0; i <= 18; i++) { const a = i / 18 * Math.PI * 2, d = 1 + (r() - 0.5) * jit; const px = w / 2 + Math.cos(a) * rx * d, py = h / 2 + Math.sin(a) * ry * d; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath();
  };
  g.fillStyle = 'rgba(120,104,78,0.28)'; blob(w * 0.58, h * 0.58, 0.25); g.fill();
  g.fillStyle = 'rgba(18,15,11,0.7)'; blob(w * 0.47, h * 0.47, 0.3); g.fill();
  const n = Math.round(26 * s.w * s.h + 10);
  for (let i = 0; i < n; i++) {
    const px = w / 2 + (r() + r() - 1) * w * 0.48, py = h / 2 + (r() + r() - 1) * h * 0.48;
    const sw = 1.5 + r() * 5, sh = 1.2 + r() * 3, a = r() * 7, v = r();
    g.save(); g.translate(px, py); g.rotate(a);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-sw / 2 + 0.8, -sh / 2 + 1, sw, sh);
    g.fillStyle = v < 0.06 ? col.dark : v < 0.085 ? col.body : RUB[Math.floor(r() * RUB.length)];
    g.fillRect(-sw / 2, -sh / 2, sw, sh);
    g.restore();
  }
  // travi piegate
  g.strokeStyle = '#24221d'; g.lineWidth = 1;
  for (let i = 0, nb = 2 + s.w; i < nb; i++) {
    const px = w * (0.2 + r() * 0.6), py = h * (0.2 + r() * 0.6), a = r() * 7, l = 6 + r() * 10;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l * 0.6, py + Math.sin(a) * l * 0.6); g.lineTo(px + Math.cos(a + 0.5) * l, py + Math.sin(a + 0.5) * l); g.stroke();
  }
  return { c, x: -m, y: -m, w: w + 2 * m, h: h + 2 * m };
}

/* ---------- relitti ---------- */
// Ingombro del relitto preso dal mezzo distrutto: lunghezza, larghezza e tipo di propulsione.
export function wreckShape(u) {
  if (!u || u.builder || !u.d) return { L: 20, W: 10, p: 'W' };
  const C = CHASSIS[u.d.c]; return { L: C.size[0], W: C.size[1], p: u.d.p };
}

export function resetAnim() { poses.clear(); kicks.clear(); doors.clear(); cranes.clear(); }
// Toglie lo stato dei mezzi e dei cantieri che non si vedono più da un po'.
export function pruneAnim(now) {
  for (const [id, v] of poses) if (now - v.seen > 3) poses.delete(id);
  for (const [id, c] of cranes) if (now - c.last > 3) cranes.delete(id);
}
