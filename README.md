# Cockpit Découpe — France Immeuble

Cockpit d'opération de vente à la découpe (Groupe Grey Stone Capital / France
Immeuble). Voir [`CLAUDE.md`](./CLAUDE.md) pour la spec produit complète.

## Stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **Supabase** « Plein Bail » (mutualisé marketplace + cockpit) — `@supabase/ssr`
- Déploiement **Vercel** (preview par milestone)

## Démarrage

```bash
cp .env.example .env.local   # remplir si besoin (clés publiques déjà pré-remplies)
npm install
npm run dev                  # http://localhost:3000
```

## Variables d'environnement

| Variable | Rôle | Secret ? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL projet Plein Bail | non (public) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé publishable (RLS) | non (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | accès serveur admin | **oui** — jamais committer |
| `BUBBLE_APP_URL` / `BUBBLE_API_TOKEN` / `BUBBLE_ENV` | lecture Bubble (voir `integrations/bubble`) | token = **oui** |

## Structure

```
app/                  routes App Router (UI cockpit)
lib/supabase/         clients Supabase (client.ts navigateur, server.ts serveur)
integrations/bubble/  pipeline de lecture Bubble Data API (France Immeuble → cockpit)
CLAUDE.md             source de vérité produit (spec v2)
```

## Notes d'architecture

- Un seul projet Supabase (« Plein Bail »). Le cockpit ajoute la couche
  `operations` au-dessus de `listings` / `listing_lots` — pas de table
  `properties`, pas de 2ᵉ base (cf. CLAUDE.md §3.1).
- Garde-fous non négociables : conformité Hoguet, RGPD locataires, doctrine
  préemption, cloisonnement cockpit ↔ marketplace (cf. CLAUDE.md §8).
