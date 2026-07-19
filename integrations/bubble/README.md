# Lecture Bubble → Valorisation

Pipeline **lecture seule** qui interroge la base **Bubble de France Immeuble**
(Data API) pour alimenter le cockpit Valorisation. Aucun secret n'est versionné :
tout passe par variables d'environnement.

## Prérequis côté Bubble

1. **Settings → API → Enable Data API** (activer).
2. Cocher les **data types** à exposer en lecture (ex. opérations, immeubles, lots,
   prestataires…). Chaque type coché devient lisible via `GET /api/1.1/obj/{type}`.
3. Si les types ne sont pas publics : créer un **API token** (Settings → API → API Tokens).

## Où vit le token `BUBBLE_API_TOKEN` ?

Le token Bubble n'est **pas** lecture seule : il donne un accès admin à l'API de
l'app. On ne le committe jamais. Il a deux foyers possibles, selon l'usage :

| Usage | Où poser la variable | Qui la lit |
|---|---|---|
| **App déployée (prod)** | Environment Variables **Vercel** | le runtime Next.js sur Vercel |
| **Reconnaissance / scripts dans la session Claude Code** | Variables d'environnement de **l'environnement Claude Code** | `recon.mjs` ici |

> ⚠️ Les variables **Vercel ne sont PAS accessibles** depuis le sandbox de session
> Claude Code. Pour que la recon tourne ici sans coller le token dans le chat,
> ajoute `BUBBLE_APP_URL` et `BUBBLE_API_TOKEN` aux variables **de l'environnement
> Claude Code** (cf. https://code.claude.com/docs/en/claude-code-on-the-web).
> Après la recon, tu peux **révoquer/regénérer** le token côté Bubble.

## Configuration locale (alternative)

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
