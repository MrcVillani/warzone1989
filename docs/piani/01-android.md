# Piano 01 · Versione Android con APK

Richiesta del proprietario: una versione del gioco installabile su Android, con il suo APK.

## Scelte

- **Guscio WebView nativo** in `android/`: un'unica activity a schermo intero che carica `dist/index.html` dagli
  asset dell'app. Il gioco resta uno solo per browser, anteprima e Android; nessuna regola duplicata.
- **Orientamento orizzontale** (`sensorLandscape`): uno strategico si gioca meglio in orizzontale.
- **Nessun permesso** (niente `INTERNET`): il gioco funziona offline. I font di Google non si caricano e si usano
  quelli di riserva già previsti nel CSS.
- Identificativo `com.mrcvillani.warzone1989`, nome «Warzone 1989», `minSdk 24` (Android 7.0), `targetSdk 35`.
- Icona adattiva originale (vettoriale), nei colori del gioco.
- APK **debug firmato con la chiave di debug** generata sulla macchina di build: si installa a mano sul telefono.
  Nessuna chiave nel repository. Una firma di rilascio per Google Play è un passo successivo, se servirà.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | frontend | `scripts/android-sdk.sh`: installa in `~/android-sdk` command-line tools, `platforms;android-35`, `build-tools;35.0.0`, `platform-tools`, accettando le licenze; idempotente |
| 2 | frontend | progetto Gradle in `android/` (AGP compatibile con Gradle 8.14, Java 17+), wrapper Gradle, `MainActivity` WebView, icona, tema scuro a schermo intero; tasto Indietro: chiede conferma prima di uscire o mette in pausa |
| 3 | frontend | `scripts/android.mjs` + `npm run android`: build web, copia `dist/index.html` negli asset, `assembleDebug`, copia l'APK in `dist/warzone1989.apk` |
| 4 | tester | verifica dell'APK (pacchetto, versioni SDK, permessi, firma, asset identico a `dist/index.html`) e prova nel browser in formato telefono orizzontale; test automatico in `tests/` |

Contratto con il motore: nessun cambiamento. Ordine: 1 → 2 → 3 → 4.

## Verifica

`npm test`, `npm run e2e`, `npm run android` verdi; `apksigner verify` e `aapt2 dump badging` sull'APK; screenshot del
gioco in orizzontale su telefono in `tests/e2e/out/`.
