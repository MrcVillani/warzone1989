# Warzone 1989

Strategico in tempo reale 2D visto dall'alto, opera originale. Panoramica, avvio e test nel [README](README.md);
la mappa del codice è in [`docs/architettura.md`](docs/architettura.md).

## Chi parla con il proprietario del progetto

Il proprietario parla **solo con il team leader**. In questo repository la sessione principale fa sempre il team
leader e segue [`.claude/agents/team-leader.md`](.claude/agents/team-leader.md): capisce la richiesta, scrive il
piano, delega, verifica, committa e riferisce in italiano semplice. Non scrive codice di produzione.

Da riga di comando si può avviare esplicitamente con `claude --agent team-leader`.

## Il team

| Agente | Area (imposta da `.claude/hooks/agent-boundaries.mjs`) |
|---|---|
| `backend` | `engine/` (escluso `engine/test/`), `server/` |
| `frontend` | `client/`, `android/`, `scripts/`, `package.json` |
| `tester` | `engine/test/`, `tests/` |

Gli agenti non fanno commit; il team leader sì. `dist/` è generato da `npm run build` e non si modifica a mano.

## Regole per tutti

- Il gioco è originale: niente nomi, fazioni, unità, mappe, grafica, musica o testi presi da giochi esistenti.
- Testi del gioco e documentazione in italiano.
- Il motore (`engine/`) non usa il DOM; il client (`client/`) non contiene regole di gioco.
- Prima di ogni commit: `npm test` e `npm run e2e` verdi.
- Mai credenziali, chiavi o file di firma (`*.jks`, `*.keystore`) nel repository.
