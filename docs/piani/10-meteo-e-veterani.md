# Piano 10 · Meteo e veterani

Richiesta del proprietario: tra i miglioramenti proposti ha scelto «Meteo e veterani». **In attesa di approvazione.**

## Meteo

Tre condizioni: **sereno** (com'è oggi), **pioggia**, **nebbia**. Valgono per tutti e due i lati.

| Condizione | Regole | Aspetto e suono |
|---|---|---|
| Pioggia | fuori strada i mezzi su ruote vanno al 80% e i semicingolati al 90% (fango); il lanciafiamme fa il 75% del danno; i relitti smettono prima di bruciare | gocce, terreno più scuro e lucido, pozzanghere, schizzi sull'acqua; rumore di pioggia e tuoni lontani |
| Nebbia | la vista di mezzi ed edifici scende al 70% (mai sotto 2,5 caselle); le gittate non cambiano, ma si spara solo a ciò che un proprio mezzo vede | banchi di nebbia che si muovono, colori smorzati; suoni ovattati |

- **Campagna**: «Il passo dei larici» con la nebbia, «La diga di Serra Alta» con la pioggia, «Contrattacco» con la
  pioggia che smette quando si passa al contrattacco (insieme al cambio della musica). Le altre restano serene; la 1
  resta di notte.
- **Schermaglia**: nuova riga «Meteo: Sereno / Pioggia / Nebbia / Variabile» nel menu, scelta ricordata. Con
  «Variabile» il tempo cambia ogni qualche minuto, con un avviso. Il valore di partenza è «Sereno»: chi non tocca
  niente gioca come oggi.
- **Latina**: con la pioggia, una battuta in più («Con la pioggia le buche diventano laghetti.»).
- **Prestazioni**: pioggia e nebbia rispettano i livelli di qualità e «riduci movimento»; in «minima» restano solo
  la tinta e le regole.

## Veterani

I mezzi che distruggono nemici salgono di grado. Vale per tutti e due i lati; torrette ed edifici non salgono.

| Grado | Distruzioni | Vantaggi |
|---|---|---|
| Recluta | 0 | nessuno |
| Esperto | 2 | +8% danno, +10% punti struttura |
| Veterano | 5 | +16% danno, +20% punti struttura |
| Asso | 10 | +25% danno, +30% punti struttura, si ripara piano da solo quando non combatte |

- Il grado si vede come gallone sopra il mezzo e nel pannello della selezione; alla promozione un piccolo lampo e,
  per gli assi del giocatore, un avviso.
- I genieri non salgono di grado. Il modulo riparazione conta le riparazioni come mezza distruzione ogni 150 punti
  riparati, così anche i mezzi di supporto fanno carriera.
- **Campagna (scelta da confermare)**: alla vittoria, fino a tre mezzi sopravvissuti di grado Veterano o Asso
  seguono il giocatore nella missione dopo, in più rispetto ai mezzi di partenza.

## Contratto tra motore e client

- `WEATHER` (tabella: nome, vista, velocità fuori strada per propulsione, danno del fuoco) e `S.weather`
  (`'clear' | 'rain' | 'fog'`), salvato; i salvataggi vecchi caricano `'clear'`.
- `MISSIONS[].weather`; in «Contrattacco» il cambio avviene con la fase 2.
- `newGame(diff, seed, { weather })` per la schermaglia: `'clear' | 'rain' | 'fog' | 'variable'`; `S.weatherMode`.
- Evento `weather` `{ from, to }` quando il tempo cambia.
- `RANKS` (tabella: nome, distruzioni, moltiplicatori) e, su ogni mezzo, `xp` e `rank` (0–3), salvati.
- Evento `rank` `{ id, owner, rank, x, y }` alla promozione.
- Campagna: `finishMission` ricorda i veterani (progetto e grado); `newGame(..., { veterans })` li mette in campo.

## Verifica

- Test del motore: effetti del meteo su velocità, vista e danno; gradi e vantaggi; salvataggi vecchi e nuovi;
  veterani tra una missione e l'altra.
- Bilanciamento: `tests/balance/campagna.mjs` sulle missioni con il meteo; le percentuali di vittoria non devono
  spostarsi di molto. IA contro IA in schermaglia con ogni meteo.
- Browser: nessun errore, meteo visibile su computer e telefono, galloni leggibili, fps a «auto» non peggiori di
  oggi con 200 mezzi sotto la pioggia.

## Sotto-compiti

| # | Agente | Compito |
|---|---|---|
| 1 | backend | meteo (tabella, regole, missioni, schermaglia, variabile, salvataggi), gradi e veterani, eventi |
| 2 | frontend | pioggia e nebbia (disegno e suono), riga «Meteo» nel menu, galloni, pannello, avvisi, battuta di Latina; può partire in parallelo: il contratto è fissato qui sopra |
| 3 | tester | test del motore, bilanciamento, prove nel browser |
