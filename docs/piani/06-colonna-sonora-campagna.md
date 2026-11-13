# Piano 06 · Colonna sonora della campagna (OST)

Richiesta del proprietario: una colonna sonora (OST) costruita sulla campagna «Operazione Valle Grigia».

## Scelte

- **Un profilo musicale per missione** in `client/music.js`: tonalità e modo, tempo, variante del tema, strumenti in
  primo piano e carattere della battaglia, scelti sull'atmosfera del briefing. In partita la musica usa il profilo della
  missione in corso; la schermaglia e il menu restano come oggi.
- **Album esportato** con lo stesso motore (`OfflineAudioContext`), in MP3 stereo, con copertina testuale e scaletta:

| # | Titolo | Fonte |
|---|---|---|
| 1 | Valle del Serra | tema del menu |
| 2 | Testa di ponte | missione 1 |
| 3 | I pozzi del guado | missione 2 |
| 4 | La colonna dei rifornimenti | missione 3 |
| 5 | Il passo dei larici | missione 4 |
| 6 | La diga di Serra Alta | missione 5 |
| 7 | Due fuochi | missione 6 |
| 8 | Contrattacco | missione 7 |
| 9 | Il comando del Direttorio | missione 8 |
| 10 | Valle liberata | finale della campagna |
| 11 | Brigata sconfitta | sconfitta |

- Ogni traccia di missione dura 2–3 minuti con un arco calma → tensione → battaglia → ritorno, con dissolvenza finale.
- **Tutto originale**: temi, progressioni e ritmi composti per il gioco; nessuna citazione o imitazione di brani
  esistenti.
- Script `scripts/ost.mjs` (`npm run ost`) che rigenera l'album in `dist/ost/` (cartella generata, non nel
  repository).

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | frontend | profili per missione in `client/music.js`, collegamento alla missione in corso, script di esportazione dell'album |
| 2 | tester | controlli: profilo giusto per ogni missione, schermaglia invariata, nessun errore, prestazioni invariate |

Contratto con il motore: nessun cambiamento (il client legge `S.mission`).
