// Costruisce l'APK Android (debug, firmato con la chiave di debug della macchina):
//   1. build web (scripts/build.mjs) → dist/index.html
//   2. copia in android/app/src/main/assets/index.html (file generato, non va nel repository)
//   3. ./gradlew assembleDebug in android/
//   4. copia l'APK in dist/warzone1989.apk
// Serve l'SDK Android: ANDROID_HOME, oppure ~/android-sdk preparato da `bash scripts/android-sdk.sh`.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(root, 'android');

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`\n${path.basename(cmd)} ${args.join(' ')}: uscito con codice ${r.status}`);
    process.exit(r.status ?? 1);
  }
}

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'android-sdk');
if (!existsSync(path.join(sdk, 'platforms', 'android-35'))) {
  console.error(`SDK Android non trovato in ${sdk} (manca platforms/android-35).\n`
    + 'Installalo con: bash scripts/android-sdk.sh  (oppure imposta ANDROID_HOME)');
  process.exit(1);
}

// 1. build web
run(process.execPath, [path.join(root, 'scripts', 'build.mjs')], { cwd: root });

// 2. asset dell'app
const assets = path.join(androidDir, 'app', 'src', 'main', 'assets');
mkdirSync(assets, { recursive: true });
copyFileSync(path.join(root, 'dist', 'index.html'), path.join(assets, 'index.html'));

const localProps = path.join(androidDir, 'local.properties');
if (!existsSync(localProps)) writeFileSync(localProps, `sdk.dir=${sdk.replace(/\\/g, '\\\\')}\n`);

// 3. APK
const win = process.platform === 'win32';
run(path.join(androidDir, win ? 'gradlew.bat' : 'gradlew'), ['assembleDebug', '--console=plain'], {
  cwd: androidDir,
  env: { ...process.env, ANDROID_HOME: sdk },
  shell: win,
});

// 4. copia in dist/
const apk = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const out = path.join(root, 'dist', 'warzone1989.apk');
copyFileSync(apk, out);
console.log(`dist/warzone1989.apk ${(statSync(out).size / 1024).toFixed(1)} KB`);
