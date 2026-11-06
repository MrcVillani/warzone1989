// Costruisce il gioco in un solo file HTML, con CSS e JavaScript in linea.
//   dist/index.html     documento completo: browser, server statico, WebView Android
//   dist/artifact.html  frammento senza <html>/<head>, per pubblicarlo come pagina su claude.ai
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
mkdirSync(out, { recursive: true });

const js = await build({
  entryPoints: [path.join(root, 'client/main.js')],
  bundle: true, format: 'iife', target: 'es2020', minify: true, write: false, legalComments: 'none',
});
const code = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(path.join(root, 'client/style.css'), 'utf8');
const tpl = readFileSync(path.join(root, 'client/index.html'), 'utf8');
const fragment = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => code);

const head = '<!doctype html>\n<html lang="it">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  + '<meta name="theme-color" content="#111412">\n'
  + '<style>[hidden]{display:none!important} body{margin:0} :root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>\n';
const i = fragment.indexOf('<div id="app">');
const full = head + fragment.slice(0, i) + '</head>\n<body>\n' + fragment.slice(i) + '</body>\n</html>\n';

writeFileSync(path.join(out, 'artifact.html'), fragment);
writeFileSync(path.join(out, 'index.html'), full);
console.log(`dist/index.html ${(full.length / 1024).toFixed(1)} KB · dist/artifact.html ${(fragment.length / 1024).toFixed(1)} KB`);
