// Verifica dell'APK Android prodotto da `npm run android` (dist/warzone1989.apk).
// Controlla pacchetto, versioni SDK, etichetta, permessi, activity di avvio, orientamento, firma
// e che l'asset assets/index.html sia identico a dist/index.html.
// Uso: npm run android && node tests/android/verify-apk.mjs
// Serve l'SDK Android con build-tools 35.0.0: ANDROID_HOME (o ANDROID_SDK_ROOT, o ~/android-sdk come
// scripts/android.mjs), e il comando `unzip` per estrarre l'asset.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apk = path.join(root, 'dist', 'warzone1989.apk');
const html = path.join(root, 'dist', 'index.html');

const fail = msg => { console.error(`ERRORE ${msg}`); process.exit(1); };

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'android-sdk');
const bt = path.join(sdk, 'build-tools', '35.0.0');
const aapt2 = path.join(bt, 'aapt2'), apksigner = path.join(bt, 'apksigner');
if (!existsSync(aapt2) || !existsSync(apksigner))
  fail(`SDK Android non trovato: mancano aapt2 o apksigner in ${bt}.\n`
    + 'Imposta ANDROID_HOME oppure installa l’SDK con: bash scripts/android-sdk.sh');
if (!existsSync(apk)) fail(`APK non trovato: ${path.relative(root, apk)}. Costruiscilo con: npm run android`);
if (!existsSync(html)) fail(`manca ${path.relative(root, html)}. Costruiscilo con: npm run build`);

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: opts.encoding ?? 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.error) fail(`${path.basename(cmd)}: ${r.error.message}`);
  return r;
}

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

// aapt2 dump badging: pacchetto, SDK, etichetta, activity di avvio
const badging = sh(aapt2, ['dump', 'badging', apk]);
if (badging.status !== 0) fail(`aapt2 dump badging: ${badging.stderr.trim()}`);
const b = badging.stdout;
const pkg = (b.match(/^package: name='([^']+)'/m) || [])[1];
const minSdk = (b.match(/^minSdkVersion:'(\d+)'/m) || [])[1];
const targetSdk = (b.match(/^targetSdkVersion:'(\d+)'/m) || [])[1];
const label = (b.match(/^application-label:'([^']*)'/m) || [])[1];
const launch = (b.match(/^launchable-activity: name='([^']+)'/m) || [])[1];
check(pkg === 'com.mrcvillani.warzone1989', `pacchetto com.mrcvillani.warzone1989 (trovato: ${pkg})`);
check(minSdk === '24', `minSdk 24 (trovato: ${minSdk})`);
check(targetSdk === '35', `targetSdk 35 (trovato: ${targetSdk})`);
check(label === 'Warzone 1989', `etichetta «Warzone 1989» (trovata: ${label})`);
check(!!launch && launch.startsWith('com.mrcvillani.warzone1989.'), `activity di avvio presente (${launch})`);

// Permessi: nessuno (il gioco gira offline dagli asset).
const perms = sh(aapt2, ['dump', 'permissions', apk]);
if (perms.status !== 0) fail(`aapt2 dump permissions: ${perms.stderr.trim()}`);
const used = [...perms.stdout.matchAll(/^uses-permission(?:-sdk-23)?: name='([^']+)'/gm)].map(m => m[1]);
check(used.length === 0 && !/uses-permission/.test(b), `nessun permesso${used.length ? ` (trovati: ${used.join(', ')})` : ''}`);

// Orientamento orizzontale dell'activity di avvio (sensorLandscape = 6).
const tree = sh(aapt2, ['dump', 'xmltree', '--file', 'AndroidManifest.xml', apk]);
const orient = (tree.stdout.match(/screenOrientation\(0x0101001e\)=(\d+)/) || [])[1];
check(orient === '6', `activity in orizzontale con sensore (screenOrientation=${orient}, atteso 6 = sensorLandscape)`);

// Firma
const sig = sh(apksigner, ['verify', '--verbose', '--print-certs', apk]);
const sigOut = sig.stdout + sig.stderr;
check(sig.status === 0 && /^Verifies$/m.test(sig.stdout), 'firma valida (apksigner verify)');
check(/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(sigOut), 'firmato con lo schema v2 (necessario da Android 7.0)');
const signers = Number((sigOut.match(/Number of signers: (\d+)/) || [])[1]);
check(signers === 1, `un solo firmatario (trovati: ${signers})`);

// Asset identico a dist/index.html
const asset = sh('unzip', ['-p', apk, 'assets/index.html'], { encoding: 'buffer' });
if (asset.status !== 0) fail(`unzip -p: impossibile leggere assets/index.html dall'APK (${String(asset.stderr).trim()})`);
const hash = buf => createHash('sha256').update(buf).digest('hex');
const ha = hash(asset.stdout), hd = hash(readFileSync(html));
check(asset.stdout.length > 0 && ha === hd,
  `assets/index.html identico a dist/index.html (${asset.stdout.length} byte, sha256 ${ha.slice(0, 12)}…${ha === hd ? '' : ` contro ${hd.slice(0, 12)}…`})`);

if (failures.length) { console.error(`\n${failures.length} controlli falliti.`); process.exit(1); }
console.log('\nAPK verificato: tutti i controlli sono passati.');
