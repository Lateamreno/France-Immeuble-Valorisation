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
- **DÉCISION (10/08/26, remplace la charte pour cette phase) : réplique 100 % fidèle
  du BO Bubble actuel d'abord** — mêmes couleurs, mêmes écrans, même workflow.
  La charte bronze/claire et les évolutions (découpe, Plein Bail, IA) viendront
  APRÈS avoir atteint l'iso-fonctionnel. Un dashboard « 9 cases » chartré avait été
  posé puis remplacé par la réplique (dispo dans l'historique git si besoin).
- **Captures en pixels** : le connecteur Drive ne renvoie que de l'OCR via
  `read_file_content`; les pixels s'obtiennent via `download_file_content` —
  les gros résultats sont sauvés par le harness dans
  `~/.claude/projects/<session>/tool-results/*.txt` (JSON `{content: base64, title}`),
  les petits passent par des sous-agents puis extraction de leur transcript JSONL.
  Scripts : `scratchpad/decode-tr.mjs` + `scratchpad/extract.mjs` ; images dans
  `scratchpad/captures/`.
- **Design system du BO relevé au pixel** (voir en-tête de `app/globals.css`) :
  sidebar #424247, slate #44525f, rouge #d60000, orange #e3790d, vert #3db327,
  bande bloc #e3e3e3, fond colonnes #f0f0f0. Polices réelles de l'app Bubble :
  **Poppins + Lato** (auto-hébergées dans `public/fonts`).
- **Dashboard répliqué** (`app/page.tsx` + `lib/data/dashboard.ts`) : 3 blocs
  repliables PROSPECTS / COMMERCIALISATIONS / VENTES (badges rouge + carré,
  barre rouge/verte et k€ HT sur VENTES), colonnes avec compteurs, cartes
  fidèles (vignette + badge RV, chip contact, chip date + note, frise rouge
  « en attente » date→motif→date, prix, honos k€, statut mandat rouge,
  compteurs propositions/visites/offres, icônes d'alerte rouges, boutons
  › Contacté / › Estimer / › OK pour vendre / Réactiver vert /
  › Programmer le compromis), topbar (recherche + pills En cours/En attente +
  bouton orange agent), bottom bar 7 entités. Données mock = cartes exactes
  des captures ; à brancher sur la Data API Bubble.
- **API Workflow Bubble** : `BUBBLE_APP_URL_WORKFLOWS` pointe sur
  `/version-test/api/1.1/wf` — permet d'APPELER des workflows (POST), pas de
  les lister ; il faudra les noms d'endpoints (ou captures de l'éditeur).

- **Dashboard branché sur la vraie base Bubble** (`lib/bubble/server.ts`) :
  - Sémantique VALIDÉE : colonnes = immeubles non archivés groupés par préfixe
    de `Statut` (énum 0 RETIRé → 11 VENDU), filtrés par `AGENT`. Vérifié :
    Romain (`1774279722391x…`) ⇒ 5/15/16, 7/0/13, 3/0/0 = les captures.
    MAV = `1565404488771x…`. Mapping Guillaume/François/Sophie à confirmer.
  - Cartes : contact = `PROPRIETAIRE`→contact ; note/date = dernier `suivi`
    (trié Created Date desc — champ `Motif_standby` porte le motif d'attente,
    `Canals` le canal) ; carte rouge = `standby_Statut` ≠ Traité, frise
    `date_start` → `date_relance` ; statut mandat = dernier `mandat` de
    l'immeuble ; k€ HT = `honos_ht` de l'offre liée (18+17+10=45 ✓) ;
    compteurs prop/vis/off = counts par immeuble (statuts 5-7).
  - **Photos** : `photo_main_compressed` est PRIVÉ (401) → proxy
    `/api/photo?u=…` avec le token serveur + `next/image` (redimensionnement,
    certaines photos font 6 Mo). `next.config.ts` : `images.localPatterns`.
  - Dates formatées en **Europe/Paris** (sinon décalées d'un jour).
  - Fallback : sans `BUBBLE_API_TOKEN`, mock + bandeau discret.
  - ⚠️ **Vercel** : définir `BUBBLE_API_TOKEN` (+ `BUBBLE_APP_URL` propre) dans
    les env vars du projet pour que la preview affiche la vraie donnée.
  - Types annexes découverts : `user` (Agent FI/Role), `suivi` (3 496),
    `question`, `download`, `commercialisation`, `dossier`, `objectif`,
    `photo`, `parcelle`, `composant`, `charge`, `prix`, `adresse`.
  - Badges de la sidebar (36/53/5/9/31) : sémantique exacte non identifiée
    (statuts tabulés ne collent pas) → encore statiques, à confirmer avec MAV.

- **Fiche Bien répliquée** (`/bien/[id]`, `components/bien-fiche.tsx`) : rail
  droit avec indicateurs de complétude (champs `ok_*`), sections Suivi /
  Propriétaire / Emplacement / État locatif (tableau lots) / État technique /
  Description et prix / Photos / Estimations / Mandats / Dossiers / Acheteurs.
  Sélecteur d'agents = menu déroulant orange (défaut Marc-Antoine), cartes du
  dashboard cliquables. Or de la fiche : #b6a359.
- **MIGRATION SUPABASE (décisions : ne PAS écrire dans Bubble + projet DÉDIÉ)** :
  - Le BO a son **propre projet Supabase** : **`france-immeuble-bo`**
    (`sojtmhdrzmdbtqborxsi`, eu-west-1, 10 $/mois, org La Team Reno) —
    séparé de Plein Bail pour cloisonner le CRM interne de la marketplace.
    Les tables miroir un temps posées dans Plein Bail ont été **supprimées**
    et l'ancienne fonction de synchro y est neutralisée (410).
  - Les 25 data types Bubble sont mirrorés dans ce projet : tables
    `public.bo_<type>` (id Bubble en PK + `data` jsonb + bubble_created/
    modified), **RLS activée sans policy** → service_role uniquement.
    ~72 000 lignes synchronisées le 10/08/26.
  - **Edge Function `bubble-sync`** (déployée sur france-immeuble-bo) : upsert
    idempotent par type/curseur ; incrémental via `since` (Modified Date >).
    Pilotée par `scripts/sync-bubble.mjs` (BUBBLE_API_TOKEN requis).
  - **La couche de données de l'app bascule automatiquement** : si
    `SUPABASE_SERVICE_ROLE_KEY` est présente → lectures PostgREST sur bo_*
    (sémantique validée : 188 actifs, 59 Romain, mêmes lots/suivis) ; sinon
    repli Data API Bubble. Traductions : equals → `data->>k=eq.`,
    contains → `data=cs.{...}`, _id in → `id=in.(...)`, tri via
    bubble_created/modified.
  - ⚠️ **Action requise** : coller la clé service_role **du projet
    france-immeuble-bo** (Dashboard Supabase → france-immeuble-bo → Project
    Settings → API keys) en `SUPABASE_SERVICE_ROLE_KEY` dans Vercel ET dans
    l'environnement Claude (+ `SUPABASE_URL=https://sojtmhdrzmdbtqborxsi.supabase.co`).
    Le token Bubble reste utile pour la synchro et le proxy photos privées.
    L'accès à Plein Bail (NEXT_PUBLIC_*) ne sert qu'à la future passerelle
    marketplace — pont explicite entre les deux projets.
  - Écritures futures (suivis, lots, estimations, mandats…) : **dans bo_***
    uniquement ; Bubble reste en lecture. Attention au recouvrement : tant
    que le BO Bubble est utilisé en parallèle, une resynchro écrase les
    lignes modifiées des deux côtés (dernier Modified Date gagne côté sync).

**Prochain :** écritures Supabase (ajouter un suivi, éditer les lots/infos du
bien, wizard estimation → mandat → dossier → commercialisation), puis
réplique des modules liste restants (Immeubles, Estimations, Mandats,
Recherches, Contacts, Propositions, Visites, Offres, Suivi, Objectifs, Datas).
