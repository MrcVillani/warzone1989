// Web Worker della cottura del terreno: riceve la richiesta di un pezzo, lo cuoce su una OffscreenCanvas e restituisce
// un'ImageBitmap (passata senza copie). scripts/build.mjs lo impacchetta a parte e lo mette nel gioco come testo: il
// gioco lo avvia da un Blob, così funziona anche nel file unico, nell'anteprima e nell'APK.
import { bakeChunk } from './terrain-bake.js';

const mk = (w, h) => new OffscreenCanvas(w, h);
self.onmessage = e => {
  const { id, args } = e.data;
  try {
    const c = bakeChunk(args, mk), bmp = c.transferToImageBitmap();
    self.postMessage({ id, bmp }, [bmp]);
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
