// Costanti dell'aspetto condivise dal disegno e dalla cottura del terreno nel Web Worker (niente DOM qui).
//   SUN: direzione in cui cadono le ombre (x, y; la luce viene dal lato opposto, da nord-ovest), elevazione e lunghezza
//   delle ombre · WIND: vento in pixel al secondo (fumo, polvere, nuvole, alberi) · NIGHT: tinte della notte.
export const SUN = { sx: 0.62, sy: 0.78, el: 0.42, len: 1 };
export const WIND = { x: 15, y: 4 };
// Notte: luce ambiente della tela della luce (moltiplicata sul mondo), colore della nebbia, tinta del terreno cotto
// quando la tela della luce è spenta (qualità minima), tinta dei mezzi e del fumo, colori del contorno dei lati.
export const NIGHT = {
  amb: [46, 58, 100], amb2: [30, 38, 72], fog: [10, 14, 26], fogA: [140, 252],
  bake: [84, 98, 150], unit: [0.62, 0.66, 0.86], smoke: 0.45, rim: ['rgba(255,214,140,0.95)', 'rgba(255,128,110,0.95)'],
};
// Lato dei pezzi di terreno in pixel del mondo: un settore della carta (8 caselle).
export const CHUNK = 256;
