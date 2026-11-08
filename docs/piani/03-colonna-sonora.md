# Piano 03 · Colonna sonora adattiva

Richiesta del proprietario: una colonna sonora più epica, calma nei momenti di tranquillità e più epica durante i
combattimenti, con dissolvenze tra le due.

## Scelte

- **Musica originale generata in tempo reale con Web Audio**, come i suoni: nessun file audio, nessun tema preso o
  imitato da giochi, film o brani esistenti. Temi, progressioni e ritmi sono composti per questo gioco.
- **Due strati sullo stesso orologio e sulla stessa armonia**, così la dissolvenza non stona né salta:
  - **calma**: tappeto d'archi largo, melodia solenne di ottoni (corni), coro lontano, arpa o pianoforte in arpeggi,
    timpani radi; tempo lento (circa 70 battiti al minuto);
  - **battaglia**: lo stesso giro armonico con archi in ostinato serrato, tamburi da guerra, colpi di ottoni, rullante,
    piatti in crescendo nei passaggi, tema eroico di ottoni; il tempo raddoppia la suddivisione senza cambiare il passo
    di base, così i due strati restano allineati.
- **Intensità del combattimento** calcolata dal client con gli eventi del motore (vampe e esplosioni che coinvolgono il
  giocatore o visibili, perdite, avviso «Contatto nemico»), levigata nel tempo: lo strato di battaglia entra in circa
  2 s e se ne va in circa 10 s senza scontri. Uno stato intermedio di **tensione** (nemico in vista, allarme) aggiunge
  solo percussioni e archi più tesi.
- **Altri momenti**: tema del menu e del briefing; breve frase di **vittoria** e di **sconfitta**; frase di passaggio
  quando un obiettivo cambia fase.
- **Comandi**: «Musica» acceso/spento e volume separato da quello degli effetti, nella guida «Comandi», salvati sul
  dispositivo. La musica parte al primo gesto e si ferma quando la pagina va in secondo piano.
- **Prestazioni**: poche voci, nodi riusati, pianificazione con anticipo sull'orologio audio; nessun effetto visibile
  sulla fluidità del gioco.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | frontend | motore musicale in `client/music.js`, collegamento agli eventi e all'interfaccia, comandi e salvataggio |
| 2 | frontend | anteprime: script fuori dal repository che registra con `OfflineAudioContext` un minuto di calma, il passaggio alla battaglia e il ritorno, per farle ascoltare al proprietario |
| 3 | tester | prove nel browser: musica che parte dopo il gesto, passaggio calma → battaglia → calma, comandi salvati, nessun errore, costo sulla fluidità |

Contratto con il motore: nessun cambiamento.
