# Piano 09 · Mappa «Latina»

Richiesta del proprietario: una mappa che rispecchi la città di Latina. Approvata («Latina map ok»).

## Scelte

- **Disegnata a mano** da conoscenze geografiche pubbliche: l'accesso ai dati di OpenStreetMap da questo ambiente non
  è stato concesso. Forma riconoscibile, non precisa al metro; proporzioni **compresse** per stare in 64×64 caselle.
- **Mappa di schermaglia** scelta dal menu («Mappa: Casuale / Latina»). Può diventare una missione in seguito.
- Nessun riferimento politico nei nomi: si usano i nomi correnti dei luoghi (per esempio «Canale delle Acque Alte»).

## Geografia (nord in alto)

- **Centro** a metà mappa: piazza aperta (piazza del Popolo) con viali a raggiera e due circonvallazioni ad anello;
  isolati di città tra i viali; il parco comunale come macchia di bosco vicino al centro.
- **Pontina** come strada lunga da nord-ovest a sud-est, a ovest della città.
- **Canale delle Acque Alte** da nord-est verso il mare a sud-ovest, con ponti sulle strade principali (guadi); altri
  canali di bonifica minori, diritti, nei campi.
- **Mare** lungo il bordo sud-ovest con il **lido** (strada costiera) e il **lago di Fogliano** dietro la duna.
- **Campi della bonifica** con poderi sparsi (piccoli isolati) e filari di alberi lungo le strade.
- **Monti Lepini** come rocce e alture nell'angolo nord-est; **Latina Scalo** (stazione e ferrovia) verso nord-est.
- **Basi**: Brigata Aurora dal lido (sud-ovest), Direttorio Ferreo da Latina Scalo, ai piedi dei Lepini (nord-est).
  La mappa non è simmetrica: l'equilibrio si ottiene con giacimenti e percorsi di lunghezza simile, verificato con
  partite simulate IA contro IA.

## Motore

- Due terreni nuovi: **CITTÀ** (isolato: non attraversabile, come la roccia) e **STRADA** (asfalto: i mezzi su ruote
  e semicingolati vanno più veloci, i cingolati un po').
- Mappe disegnate in `engine/maps/` come testo (una lettera per terreno) e posizione delle basi per mappa;
  `newGame(diff, seed, { map: 'latina' })` per la schermaglia.
- Salvataggi compatibili: le partite vecchie restano sulla mappa generata.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | backend | terreni CITTÀ e STRADA, velocità per propulsione, mappe disegnate, mappa Latina, basi e giacimenti; IA che sa usare le strade |
| 2 | frontend | scelta della mappa nella schermaglia, disegno di città e strade (insieme alla nuova grafica del piano 08), titoli |
| 3 | tester | test del motore per i terreni nuovi e la mappa; equilibrio con partite simulate; prova nel browser |
