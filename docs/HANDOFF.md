# HANDOFF — état du projet & décisions (à lire en début de session)

> Note de passation pour reprendre le projet sans perdre le contexte des échanges.
> Le `CLAUDE.md` reste la spec de fond ; ce fichier capture les **décisions récentes**
> et **l'état courant** qui ne sont pas encore dans la spec.

## 1. Décision structurante — Path B (refonte unifiée)

On **ne fait pas** un cockpit découpe séparé. On **reconstruit le back-office France
Immeuble en entier** (Next.js + Supabase), moderne, et la **découpe devient un mode**
de l'immeuble (switch on/off), pas une app à part. Objectif : **un seul logiciel** pour
tout piloter + automatisations + IA dans tous les process.

- Base = Supabase **« Plein Bail »** (`fkfwucqpdhbkgkouccyi`) — porte déjà `listings`,
  `listing_lots`, et les benchmarks **DVF/loyers**.
- **Passerelle Plein Bail / marketplace / Ubiflow** = brique dédiée (publier un lot
  « prêt à vendre » = flag + flux). Quasi native car même base.
- Migration depuis le CRM **Bubble** actuel (`vente.france-immeuble.fr`), par phases.

## 2. Charte graphique (ACTÉE)

Charte marque (source = thème sombre Grey Stone / Team Reno), déclinée en **clair**
pour le travail 8 h/jour. Bloc Tailwind v4 fourni par le client :

```
--color-noir: #0A0A0A; --color-noir-2: #121110; --color-noir-3: #1B1917;
--color-bronze: #C19B6E; --color-bronze-clair: #E6D4BD; --color-bronze-profond: #7A5C3E;
--color-creme: #EFE9DE; --color-gris: #8E8A84; --color-ligne: #282522;
--font-display: "Archivo"; --font-body: "Inter"; --font-mono-site: "JetBrains Mono";
```

Règles de déclinaison CLAIRE :
- Fond crème très clair, surfaces blanches, **texte noir chaud** (lisible AA).
- **Accent = bronze `#C19B6E`** ; texte/lien bronze = **bronze profond `#7A5C3E`** (contraste).
- **Rail latéral noir** (`#121110`) = signature marque (on bosse dans le contenu clair).
- Sémantique feutrée : vert sauge (ok), ocre (attention), terre cuite (retard).
- Polices à **auto-héberger** (woff2) dans le build Next (pas de CDN → build hermétique).
- **Responsive / mobile = exigence de 1er plan** (PWA mobile-first) : rail → tab bar bas,
  colonnes empilées, kanban qui défile, barre de création → bouton flottant.

## 3. Dashboard — 9 cases (ACTÉ), entonnoir type CRM Bubble

3 blocs × 3 étapes :
```
Prospection      : À contacter · À estimer · À convertir
Commercialisation: Signature contrat · Devis · RDV
Bouclage         : Démarches locatives · Ventes · Bouclage
```
Rail latéral calqué sur le BO actuel (Immeubles, Estimations, Mandats, Contacts,
Offres, Visites, Suivi/Rappels…) avec **compteurs**. Barre de création rapide en bas
(Contact · Immeuble · Mandat · Recherche · Proposition · Visite · Offre).

Maquette HTML (3 versions V1 fidèle / V2 kanban / V3 entonnoir), déjà recolorée à la
charte : artefact Claude « Cockpit France Immeuble — Dashboard (3 versions) ».
→ Base retenue : **V1 (refonte fidèle)** + kanban V2 en option de vue (à confirmer).

## 4. Sources & accès

- **Captures du BO** dans Google Drive : « Pour Claude » → **« Refonte BO france immeuble »**
  (sous-dossiers : Dashboard, Immeubles, Bien, Estimation, Mandats, Recherches, Contact,
  Visites, Offres, Suivi et rappels, Objectifs, Data). Lisibles via le connecteur Drive
  (`search_files` par parentId + `read_file_content`). ⚠️ Ces captures = **UI/menus**,
  PAS la base.
- **Base Bubble réelle** = via la **Data API** (`https://vente.france-immeuble.fr/api/1.1/obj/{type}`).
  Client lecture seule déjà codé : `integrations/bubble/` (recon.mjs, bubbleClient.mjs).
  Variables : `BUBBLE_APP_URL`, `BUBBLE_API_TOKEN`, `BUBBLE_ENV=live`.
  ⚠️ **Egress** : l'hôte `vente.france-immeuble.fr` doit être dans l'allowlist réseau de
  l'environnement (sinon 403). Le réglage ne s'applique qu'à une **nouvelle session**.
- **Workflows Bubble** : aucune API — seulement par **captures** de l'éditeur (à fournir
  quand on attaquera les automatisations).

## 5. Déploiement

- Vercel branché sur le repo, **production = branche `main`**, redeploy auto au push.
- Toujours garder `vercel.json` (framework nextjs) à la racine + Root Directory vide
  (cf. CLAUDE.md §12, runbook 404).

## 6. Prochaines étapes

1. Vérifier l'accès **API Bubble** (recon sur immeuble, lot, bail, locataire, estimation,
   mandat, contact, offre, proposition, visite, recherche).
2. Dépouiller **toutes les captures** → produire la **cartographie du BO** (par écran :
   structure / champs / workflow / à améliorer / IA-automatisation). Document sur le Drive
   (« Pour Claude »).
3. Construire le **Dashboard 9 cases** (charte, responsive), puis Immeuble / Estimation, etc.
4. Brancher progressivement : découpe (mode), passerelle Plein Bail, IA & automatisations.

## 7. État du code

App Next.js (App Router) + Tailwind v4 + Supabase (`@supabase/ssr`) déployée.
`integrations/bubble/` = lecture Bubble (le client nettoie lui-même une
`BUBBLE_APP_URL` contenant le chemin API ou `/version-test`).

**Fait (10/08/26) :**
- Cartographie complète du BO Bubble : `docs/CARTOGRAPHIE-BO.md` + `docs/cartographie/`
  (base réelle via Data API + les ~144 captures dépouillées écran par écran).
- **Charte claire posée** (`app/globals.css`) : tokens marque + déclinaison claire,
  rail noir signature, sémantique sauge/ocre/terre cuite, polices **auto-hébergées**
  (`public/fonts/*.woff2`, subsets latin variables Archivo/Inter/JetBrains Mono).
- **Dashboard 9 cases V1** (`app/page.tsx`) : 3 blocs × 3 cases (Prospection /
  Commercialisation / Bouclage), cartes immeuble avec bouton d'avancement,
  badges sémantiques, « en attente », **vue kanban en option** (toggle) ;
  rail calqué sur le BO réel avec compteurs (`lib/nav.ts`), recherche globale +
  filtre agent (topbar), **barre de création rapide** (desktop) / FAB (mobile),
  responsive (rail → tab bar bas). Données : mock typé `lib/data/dashboard.ts`
  (exemples réels de la cartographie) — à brancher sur Supabase/Bubble ensuite.

**Prochain :** brancher les compteurs/cases sur la vraie donnée, puis module Immeuble.
