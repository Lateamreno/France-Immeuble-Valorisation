# Repères de marché (loyer et prix du secteur)

La modale « valeurs du secteur » propose un ordre de grandeur avant la saisie.
**Ce n'est jamais la valeur retenue** : `bo_prix_secteur` reste rempli à la
main par l'agent, sur des chiffres qu'il a vérifiés. Le repère sert à se situer
et à repérer une saisie aberrante.

## Les deux sources

| | Source | Couverture | Rafraîchissement |
|---|---|---|---|
| Loyer | « Carte des loyers », ministère de la Transition écologique | 34 900 communes, arrondissements compris | annuel, publication en décembre |
| Prix | DVF — ventes enregistrées par les notaires (fichiers Etalab par commune) | toute la France | semestriel, ~6 mois de décalage |

Le loyer est un **loyer d'annonce** : ce que les bailleurs demandent. Le prix
est un **prix acté** : ce qui a réellement été payé. D'où un écart normal avec
les estimations des portails, qui partent de prix demandés — DVF sort
typiquement 5 à 20 % en dessous.

## Où ça vit

- `bo_loyers_commune` — table figée, une ligne par commune. Rechargée par
  `scripts/seed-loyers.mjs` à chaque millésime.
- `bo_dvf_commune` — remplie commune par commune, à la demande. Le fichier DVF
  d'une commune pèse quelques Mo : il est lu une fois, la médiane est gardée.
  Premier appel ~4 s, les suivants ~0,5 s.
- `lib/bo/reperes.ts` — calcul et cache. `app/api/reperes/route.ts` — la route.

## Recharger les loyers (une fois par an)

```bash
SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-loyers.mjs 2026
```

Le script retrouve seul le CSV du millésime sur data.gouv.fr.

> Sur Node 22, `fetch` n'utilise pas `HTTPS_PROXY` : derrière un proxy, lancer
> avec `NODE_USE_ENV_PROXY=1`.

## Renouveler le millésime DVF

`MILLESIME_DVF` dans `lib/bo/reperes.ts`. Les lignes de l'ancien millésime
restent en base — changer la constante suffit à repartir sur le nouveau.

## Ce qui n'a pas de repère

Commerce, bureau, entrepôt : ni la carte des loyers ni DVF ne les couvrent
utilement. Aucun repère n'est proposé plutôt qu'un repère faux.
