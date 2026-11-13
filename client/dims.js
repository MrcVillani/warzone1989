// Ingombro disegnato di un mezzo (lunghezza e larghezza in pixel del mondo, muso verso +x): genieri, Macchina di
// Villo (più lunga del suo telaio nel motore, per riconoscerla subito) e telai dei progetti. Serve a scarichi, fari,
// relitti, impronte e neon, che devono stare sul bordo del disegno.
import { CHASSIS } from '../engine/index.js';

export const HERO_L = 27, HERO_WD = 12.4;
export const isHero = u => !!(u && u.hero);
export function unitDims(u) {
  if (!u || u.builder || !u.d) return { L: 20, W: 10 };
  if (u.hero) return { L: HERO_L, W: HERO_WD };
  const C = CHASSIS[u.d.c]; return C ? { L: C.size[0], W: C.size[1] } : { L: 19, W: 13 };
}
