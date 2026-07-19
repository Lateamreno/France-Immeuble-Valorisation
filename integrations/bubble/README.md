# Lecture Bubble → Valorisation

Pipeline **lecture seule** qui interroge la base **Bubble de France Immeuble**
(Data API) pour alimenter le cockpit Valorisation. Aucun secret n'est versionné :
tout passe par variables d'environnement.

## Prérequis côté Bubble

1. **Settings → API → Enable Data API** (activer).
2. Cocher les **data types** à exposer en lecture (ex. opérations, immeubles, lots,
   prestataires…). Chaque type coché devient lisible via `GET /api/1.1/obj/{type}`.
3. Si les types ne sont pas publics : créer un **API token** (Settings → API → API Tokens).

## Configuration

```bash
cp integrations/bubble/.env.example integrations/bubble/.env
# éditer .env : BUBBLE_APP_URL, BUBBLE_API_TOKEN, BUBBLE_ENV
set -a && . integrations/bubble/.env && set +a
```

## Reconnaissance (inventaire)

Bubble n'expose pas la liste des data types : il faut les nommer.

```bash
node integrations/bubble/recon.mjs operation immeuble lot prestataire
```

Pour chaque type : nombre de lignes, champs détectés, un échantillon.

## Lecture programmatique

```js
import { fetchAll } from "./integrations/bubble/bubbleClient.mjs";

const operations = await fetchAll("operation", {
  constraints: [{ key: "statut", constraint_type: "equals", value: "en_cours" }],
  sortField: "Created Date",
  descending: true,
});
```

`fetchAll` gère la pagination (pages de 100, curseur automatique).

## Notes

- **Lecture seule** : aucun POST/PATCH/DELETE ici.
- RGPD (§8.3 du CLAUDE.md) : les données locataires importées de Bubble sont
  sensibles — ne jamais les exposer côté marketplace, caviardage avant partage.
- La cartographie Bubble → tables cockpit (`operations`, `owners`, `providers`…)
  se fera une fois M1 déployé et l'inventaire recon validé.
