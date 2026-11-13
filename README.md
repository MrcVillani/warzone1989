# Warzone 1989

Strategico in tempo reale 2D visto dall'alto. Ottobre 1989, Valle del Serra: al comando della Brigata Aurora metti
in funzione le pompe di gasolio, ricerchi nuove tecnologie, progetti i tuoi mezzi combinando telaio, propulsione e
arma, e distruggi il comando e le fabbriche del Direttorio Ferreo.

## Giocare

```bash
npm install
npm run build
```

Poi apri `dist/index.html` nel browser. Funziona con mouse e tastiera e con il touch del telefono.

## Android

```bash
bash scripts/android-sdk.sh   # una volta: installa l'SDK Android in ~/android-sdk
npm run android               # produce dist/warzone1989.apk
```

L'APK si installa a mano sul telefono (Android 7.0 o successivo), consentendo l'installazione da origini sconosciute.

## Sviluppo

| Comando | Cosa fa |
|---|---|
| `npm run build` | crea `dist/index.html` e `dist/artifact.html` |
| `npm test` | test del motore in Node |
| `npm run e2e` | build e prova nel browser (serve Playwright con Chromium) |
| `npm run android` | crea l'APK Android in `dist/warzone1989.apk` |
| `npm run ost` | registra la colonna sonora della campagna in MP3 in `dist/ost/` |
| `npm run check` | tutti i test |

Il codice è diviso tra il motore (`engine/`, regole di gioco senza DOM) e il client (`client/`, disegno e
interfaccia). Dettagli in [`docs/architettura.md`](docs/architettura.md).

## Team di agenti

Il progetto è sviluppato da un team di agenti Claude Code guidato da un team leader, l'unico che parla con il
proprietario: vedi [`CLAUDE.md`](CLAUDE.md) e [`.claude/agents/`](.claude/agents/).
