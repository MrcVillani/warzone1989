# Bilanciamento della campagna

Rapporto sul bilanciamento della campagna «Operazione Valle Grigia» (piano 02, fase C).

## Metodo

`tests/balance/campagna.mjs` gioca le 8 missioni in sequenza con l'IA dalla parte del giocatore (`S.autoplay`),
portando alla missione successiva le ricerche e i progetti della vittoria di durata mediana, come farebbe un giocatore
che avanza nella campagna. Per ogni missione gioca N partite con semi fissi e riporta vittorie, durata, motivo delle
sconfitte, livello tecnologico e mezzi di entrambi i lati.

```bash
node tests/balance/campagna.mjs            # N=20, «normale»
N=10 DIFF=difficile M=5,6 node tests/balance/campagna.mjs
```

I risultati completi finiscono in `tests/balance/out/` (ignorata da git).

## Obiettivi

| # | Missione | Vittorie su 20 («normale») | Durata mediana |
|---|---|---|---|
| 1 | Testa di ponte | 19–20 | 8–12 min |
| 2 | I pozzi del guado | 18–20 | 10–14 |
| 3 | La colonna dei rifornimenti | 17–19 | 12–15 |
| 4 | Il passo dei larici | 15–18 | 14–20 |
| 5 | La diga di Serra Alta | 14–17 | 15–22 |
| 6 | Due fuochi | 12–16 | 18–25 |
| 7 | Contrattacco | 10–14 | 20–28 |
| 8 | Il comando del Direttorio | 8–14 | 25–35 |

A «difficile» ogni missione deve restare vincibile e più dura che a «normale»; «facile» almeno quanto «normale».

## Risultati (N=20, vittorie · durata mediana delle vinte in minuti)

| # | Facile | Normale | Difficile |
|---|---|---|---|
| 1 | 20 · 11,6 | 20 · 11,6 | 20 · 11,5 |
| 2 | 20 · 10,9 | 20 · 10,9 | 19 · 10,9 |
| 3 | 20 · 12,0 | 19 · 12,0 | 14 · 12,0 |
| 4 | 20 · 11,9 | 18 · 16,1 | 16 · 12,0 |
| 5 | 20 · 13,1 | 15 · 16,3 | 7 · 23,6 |
| 6 | 20 · 12,5 | 15 · 14,0 | 7 · 12,5 |
| 7 | 20 · 12,4 | 14 · 19,1 | 13 · 16,1 |
| 8 | 20 · 12,6 | 10 · 15,3 | 6 · 15,5 |

A «normale» il tasso di vittoria è nell'obiettivo in tutte le missioni e scende in modo regolare. Le durate sono
nell'obiettivo per le missioni 1–5.

## Scelte principali

- **IA del giocatore**: primo attacco a 600 s invece di 210 s. Prima ogni missione si decideva al primo assalto.
  Conosce tutte le 44 ricerche (`AI_TECH_P`) e costruisce fino a 3 fabbriche.
- **Missione 1**: 6 pompe; avamposto con 12 torrette, 6 mezzi e genieri che riparano (`enemy.build: 'repair'`: non
  piazzano edifici nuovi), senza fabbrica. L'obiettivo conta i 15 edifici finiti dell'avamposto.
- **Missione 2**: 8 pompe da tenere per 9 minuti; prima ondata nemica a 150 s.
- **Missione 3**: ondate dai bordi più grandi e in crescita più rapida.
- **Missioni 4–8**: semi delle mappe scelti senza sacche che intrappolano i genieri; più difese e fabbriche al nemico
  (`enemy.factories`), quota di difensori lasciata in base (`enemy.keep`); nella missione 8 il giocatore parte con più
  gasolio, due fabbriche, torrette e bunker.
- **Missione 7**: distruggere la base nella fase 1 vince subito.
- **Difficoltà in missione** (`MISSION_DIFF`): la scala di `DIFF` è attenuata solo in campagna. «Facile» la applica
  per intero, «normale» per niente, «difficile» in piccola parte (rendita ×1,03, ricerche più veloci del 5%, ondate un
  po' prima e più grandi). Con la scala piena «difficile» non si vinceva dalla missione 3 in poi. La schermaglia non
  cambia.

## Correzione successiva: ondate con `keep`

Con `keep` alto (missione 8) le ondate si fermavano dopo la terza, perché ne servivano più mezzi di quanti `AI_ARMY` e
`keep` ne lasciassero partire: 4 partite su 10 arrivavano al limite dei 60 minuti. Ora l'ondata parte con i mezzi
disponibili. Missione 8 dopo la correzione (N=10): «normale» 5/10, mediana 22,7 min, nessuna partita al limite;
«difficile» 2/10, nessuna partita al limite.

## Limiti noti

- **Durata delle missioni 6–8** (14–19 minuti contro 18–35): nella simulazione la partita si decide in uno scontro
  pochi minuti dopo il primo attacco forte, e le armi di livello IV abbattono le difese in fretta. Un giocatore vero è
  più lento dell'IA, quindi le partite reali dovrebbero durare di più. Da rivedere dopo partite di prova.
- **Missione 1** è uguale a tutte le difficoltà: il nemico non manda ondate e la difficoltà tocca solo la sua rendita.
  Fa da introduzione.
- **Hovercraft nella missione 5**: con lo scafo leggero, nelle simulazioni facevano perdere; l'IA del giocatore passa
  dai guadi. Il giocatore può usarli.
- **Sensibilità al caso**: lo stesso ritocco può spostare il risultato di qualche vittoria su 20. Prima di fissare
  nuovi valori conviene simulare con N più alto.
