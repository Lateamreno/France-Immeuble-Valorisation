# CLAUDE.md — Cockpit Découpe (nom de travail)

> Fichier de contexte racine pour Claude Code.
> Produit interne du **Groupe Grey Stone Capital** — service découpe de **France Immeuble**.
> Version de spec : v2 · juillet 2026 (calée sur le schéma réel du projet Supabase « Plein Bail »).

---

## 0. Comment lire ce fichier

Ce document est la source de vérité du projet. Avant toute session de code :
1. Lire ce fichier en entier.
2. Lire le schéma réel de la base **avant** d'écrire la moindre migration (voir §4). Ne jamais inventer une table qui existe déjà sous un autre nom.
3. Ne jamais élargir le périmètre d'un milestone sans validation explicite.
4. Respecter les **garde-fous** de la section 8 comme des invariants non négociables (conformité Hoguet, RGPD locataires, doctrine préemption). Une violation de garde-fou est un bug bloquant, pas un arbitrage de style.
5. À chaque fin de milestone : déployer sur preview Vercel, attendre validation humaine avant le milestone suivant.

---

## 1. Objectif produit

Un **cockpit d'opération de vente à la découpe** : un immeuble = un cycle de vie complet, du mandat à l'encaissement du dernier lot. L'outil pilote la mise en copropriété, les prestataires, les locataires, les travaux, la commercialisation et la facturation d'une opération de découpe, et capitalise sur chaque opération pour accélérer la suivante.

Ce n'est **pas** un CRM généraliste ni un logiciel de gestion locative. C'est un outil d'orchestration d'opérations, mono-métier (découpe d'immeubles de rapport), pensé pour un opérateur qui enchaîne les dossiers.

**Utilisateur principal :** Marc-Antoine VOCI (admin). **Utilisateurs secondaires :** Romain (agent co), commercialisateur (accès restreint), indivisaires-vendeurs (extranet lecture seule), locataires (extranet V2, très restreint).

**Opérations de référence pour les tests :** 55 rue Volant Nanterre (11 lots principaux + caves/parkings), Maison-Alfort (5 lots), Montreuil.

---

## 2. Stack technique

- **Frontend :** Next.js (App Router) + Tailwind + shadcn/ui. PWA responsive mobile-first (un seul code = web + mobile).
- **Backend :** Supabase **« Plein Bail »** — projet mutualisé avec la marketplace « biens loués », déjà en production. PostgreSQL + RLS + Storage + Edge Functions.
  - Project ID : `fkfwucqpdhbkgkouccyi` · région `eu-west-1`.
- **Auth :** Supabase Auth (table `profiles` déjà en place, extension de `auth.users`). Rôles applicatifs (voir §3.2).
- **Email :** deux routes (§7.1). Un-à-un : boîte dédiée `devis@` (domaine à décider — **jamais** la boîte France Immeuble premium) via **Gmail API**, envoi + réception threadée. Masse : relais **SendGrid** en SMTP, sur un **sous-domaine d'envoi dédié**, plafonné à 4 000 messages par jour.
- **Signature (V2) :** Docusign (connecteur déjà disponible).
- **Données de marché :** DVF + loyers **déjà chargés dans Plein Bail** (voir §4.3). Pas d'API externe à brancher.
- **Diffusion :** Ubiflow (pont marketplace).
- **Déploiement :** Vercel (preview par milestone).

Règle héritée des autres projets du groupe : `company_id` (ou équivalent de cloisonnement) sur les tables du cockpit dès le jour 1.

---

## 3. Principes d'architecture

### 3.1 Mutualisation Supabase — le cockpit se greffe sur le schéma existant

Décision actée : **un seul projet Supabase, « Plein Bail »**, partagé entre le cockpit découpe (interne) et la marketplace « biens loués » (publique, marque autonome éditeur).

**IMPORTANT — le bien et les lots existent déjà, ne pas les recréer :**

- Le **bien** = table **`listings`** (déjà 20 lignes en prod). Un immeuble en opération découpe = un `listing`, éventuellement **non publié** côté marketplace.
- Les **lots + état locatif** = table **`listing_lots`** (déjà 65 lignes). L'état locatif (statut occupé/libre, bail, loyer, dates) y est déjà porté. C'est le modèle « lot » ET « bail » du cockpit.
- Les **photos** = `listing_photos` (déjà utilisée). Les **documents** = `listing_documents` (vide aujourd'hui) → à étendre pour le coffre-fort, pas de table parallèle.

Le cockpit **n'ajoute que sa couche « opération »** au-dessus de ce socle :

```
listings  (le bien — DÉJÀ EN PROD, partagé marketplace + cockpit)
   ├── listing_lots  (lots + état locatif — DÉJÀ EN PROD, réutilisé tel quel)
   ├── listing_photos / listing_documents  (médias & coffre — étendus)
   │
   └── operations  (NOUVELLE : le bien EN OPÉRATION découpe FI)
          ├── owners, providers, provider_quotes
          ├── mandates, preemptions, notices, negotiations
          ├── price_grids, estimations, proposals, contracts, clause_library
          ├── works, deeds, acquirers, invoices
          └── tasks, calendar_events, reminders, email_threads, emails
```

- Un `listing` peut porter une `operation` (cockpit) **et/ou** être publié comme annonce (marketplace), ou ni l'un ni l'autre.
- **Pont produit :** quand un `listing_lot` d'une opération devient « prêt à vendre », il est publié côté marketplace (flag de publication + génération flux Ubiflow). Même objet lot, deux vitrines.
- La marketplace publie aussi des `listings` de tiers **sans** opération FI : `operations` reste vide pour ceux-là.
- **NE PAS introduire de table `properties` abstraite.** Le schéma marketplace a déjà tranché : `listings` est l'entité bien. Migrer les 20 listings + 65 lots existants serait une perte pure.

### 3.2 Rôles

| Rôle | Portée |
|---|---|
| `admin` | Tout (MAV). |
| `agent` | Saisie + lecture sur toutes opérations (Romain). |
| `commercialisateur` | Lecture des lots en vente + pipeline acquéreurs, sur opérations autorisées uniquement. |
| `vendeur` (extranet) | Lecture seule de **son** opération (avancement, jalons, documents partagés). |
| `locataire` (extranet, V2) | Accès très restreint à **son** lot : offre de vente le concernant, statut de son dossier, messagerie encadrée. |

RLS par rôle + par appartenance, **cohérente avec le RLS marketplace déjà en place** sur `listings`/`listing_lots` (toutes les tables du projet ont déjà `rls_enabled = true`). Un `listing` en opération non publié ne doit jamais fuiter côté API publique marketplace.

### 3.3 Moteur de séquencement

Créer une opération instancie automatiquement un **template de phases** (les 7 phases du dossier type : urbanisme, DTG+géomètre, EDD+règlement, syndic, locataires, diagnostics+pricing, commercialisation+actes). Chaque phase génère des `tasks` datées et des `calendar_events`. Le template est éditable mais fournit le squelette par défaut.

---

## 4. Modèle de données

### 4.1 Ce qui existe déjà dans Plein Bail (à lire avant de coder — NE PAS recréer)

Tables en production (extrait pertinent) :

- `profiles` — utilisateurs (particulier / société / agence / marchand de biens), extension de `auth.users`.
- `listings` — **le bien**. Agrégats locatifs maintenus par triggers depuis `listing_lots`.
- `listing_lots` — **lots + état locatif** (statut, bail, loyer, dates…).
- `listing_photos`, `listing_documents` — médias & documents.
- `geo_pays`, `geo_regions`, `geo_departements`, `geo_communes` — référentiel géo.
- `pricing`, `orders`, `subscriptions` — monétisation marketplace (freemium + options).
- `saved_searches`, `wishlist_items`, `reports`, `contact_requests`, `phone_reveals`, `assisted_requests`, `offres`, `leads_financement`, `conversations`, `messages` — fonctionnel marketplace (plusieurs vides en v1).
- **Données de marché (déjà chargées) :** `dvf_annuel` (~102 900 lignes), `dvf_benchmarks` (~42 700), `loyers_benchmarks` (~144 000), `villes_stats` (~35 000), `references_marche` (132).

> Avant M1 : exécuter un `list_tables` verbeux sur le schéma `public` de Plein Bail et récupérer le DDL réel de `listings` et `listing_lots`. Toute la couche cockpit se cale sur leurs colonnes existantes.

### 4.2 Tables ajoutées par le cockpit

Colonnes communes : `id uuid pk`, `created_at`, `updated_at`, cloisonnement interne (les tables cockpit sont réservées aux rôles internes + extranets, jamais exposées à l'API publique marketplace). RLS activée partout.

**operations** — le cycle de vie découpe
`listing_id fk → listings`, `status` (enum : `prospection`/`mandat`/`montage`/`commercialisation`/`cloture`), `mandate_id fk?`, `bloc_value`, `decoupe_value_target`, `phase_template_id`, `opened_at`, `closed_at`, `fi_notes` (interne).

**owners** — propriétaires / indivisaires
`operation_id fk`, `name`, `type` (physique/morale), `address`, `email`, `phone`, `quote_share`, `is_signatory bool`, `portal_access bool`.

**providers** — annuaire prestataires (grandit à chaque opération)
`type` (enum : `geometre`/`diagnostiqueur`/`notaire`/`syndic`/`commissaire_justice`/`courtier`/`autre`), `name`, `email`, `phone`, `zone`, `notes`, `rating`.

**provider_quotes** — devis reçus + **historique prix cherchable**
`provider_id fk`, `operation_id fk`, `service_label`, `amount_ht`, `amount_ttc`, `delay_days`, `status` (`demande`/`recu`/`retenu`/`ecarte`), `received_at`, `document_id fk?`.
→ Requêtable par type + montant pour les affaires suivantes.

**email_templates** — modèles enregistrés
`code`, `label`, `channel`, `subject`, `body` (variables de fusion `{{listing.address}}`, `{{owner.name}}`…). Seed : les 7 modèles du dossier Volant (géomètre, diagnostiqueur, notaire, syndic, commissaire de justice, locataire, mairie).

**email_threads** / **emails** — messagerie opérationnelle
Thread rattaché à `operation_id` + `provider_id?` + `owner_id?`. `emails` : `direction` (in/out), `from`, `to`, `subject`, `body`, `gmail_message_id`, `sent_at`, `attachments jsonb`. Synchro Gmail API boîte `devis@`.

**price_grids** — grilles de prix (lignes par `listing_lot`)
`operation_id fk`, `listing_lot_id fk`, `value_free`, `value_occupied`, `net_seller_price`, `dvf_median_m2` (depuis `dvf_benchmarks`/`dvf_annuel`), `gap_vs_dvf`. Honos **charge vendeur** imposé (voir §8.2).

**estimations** — moteur bloc vs découpe
`operation_id fk`, `mode` (`lecture_vendeur` / `interne_marchand`), inputs + outputs. Mode vendeur : sans IS ni TVA sur marge. Mode interne : bilan marchand complet (TVA sur marge + IS). Absorbe les 2 outils HTML existants (bilan prévisionnel + Offre V4).

**clause_library** — bibliothèque de clauses réutilisables
`code`, `label`, `body`, `tags`. Seed : Article 8 bis travaux, Article 9 durée purpose-based, honos charge vendeur, mission de structuration…

**proposals** / **contracts** — génération de documents
`operation_id fk`, `type` (propal/mission/mandat), `clauses` (composées depuis clause_library), `generated_document_id fk`, `signature_status` (V2 Docusign).

**mandates** — registre des mandats (CONFORMITÉ HOGUET, §8.1)
`operation_id fk`, `mandate_number` (**séquentiel, immuable, sans trou**, attribué par la base), `type`, `signed_at`, `expiry`, `net_seller_fees_pct`.

**preemptions** — tracker à compte à rebours
`listing_lot_id fk`, `type` (`locataire_75`/`commercial_pinel`/`dpu_mairie`), `notified_at`, `deadline` (2 mois, +2 si prêt), `days_left` (calculé), `status` (`a_notifier`/`en_cours`/`purge`/`exercee`).

**notices** — congés & notifications (journal horodaté)
`listing_lot_id fk`, `type` (`conge_vente`/`offre_vente`/`notif_commercial`), `sent_at`, `method` (LRAR/commissaire), `commissaire_id fk?`, `document_id fk`.

**negotiations** — négos locataires
`listing_lot_id fk`, `scenario` (`achat_occupant`/`depart_indemnise`/`reste_en_place`), `notes`, `amount`, `status`, `agreement_document_id fk?`.

**works** / **work_quotes** — travaux (pont Greystone Bâtiment)
`operation_id fk`, `listing_lot_id fk?`, DCE, devis (emails-types), photos, `start_date`, `end_date`, `cost`, `provider`. Alerte spéciale lots DPE F.

**deeds** — suivi des actes
`listing_lot_id fk`, `stage` (`compromis`/`acte_authentique`), `notary_id fk`, `date`, `price`, `fees_triggered bool`.

**acquirers** — pipeline commercialisation
`listing_lot_id fk`, `name`, `source` (offmarket_FI/commercialisateur/ubiflow/marketplace), `contacted_at`, `offer_amount`, `status`.

**invoices** — facturation 3 natures **taguées par société émettrice**
`operation_id fk`, `nature` (`honos_transaction_FI` / `honos_montage_FI` / `chantier_greystone`), `issuing_company`, `amount`, `due_date`, `status` (prevu/emis/encaisse).

**tasks** / **calendar_events** / **reminders**
Générés par le moteur de séquencement + saisie manuelle. Le calendrier agrège **toutes** les échéances de **toutes** les opérations (fenêtres de congé, délais de préemption, relances devis, dates d'actes, jalons travaux).

### 4.3 Données de marché déjà disponibles (rapprochement DVF gratuit dès le MVP)

`dvf_annuel`, `dvf_benchmarks`, `loyers_benchmarks`, `villes_stats`, `references_marche` sont **déjà chargées** dans Plein Bail. Les grilles de prix consomment ces tables directement pour `dvf_median_m2` et `gap_vs_dvf` — aucun import ni API externe à prévoir. Le module estimation peut aussi s'en servir pour croiser loyers de marché et potentiel locatif.

---

## 5. Modules fonctionnels (récap)

1. **Dashboard** — todo + calendrier unifié multi-opérations, alertes échéances.
2. **Immeubles & lots** — sur `listings`/`listing_lots`, multi-propriétaires, coffre documentaire.
3. **États locatifs & baux** — compte à rebours fenêtre de congé par lot (depuis `listing_lots`).
4. **Moteur d'estimation** bloc vs découpe (2 modes).
5. **Grilles de prix** + rapprochement DVF (données déjà là).
6. **Propal / contrat / mandat** — fusion données + bibliothèque de clauses (+ Docusign V2).
7. **Annuaire prestataires** + historique prix cherchable + génération de liens/recherche d'emails géolocalisés.
8. **Emails & devis** — modèles, envoi 1-clic avec PJ, réception threadée, comparateur de devis.
9. **Préemptions** — tracker à compte à rebours (loi 75 / Pinel / DPU).
10. **Congés & négociations** — génération, suivi, journal horodaté.
11. **Registre des mandats** + suivi des actes.
12. **Travaux / DCE** — pont Greystone Bâtiment.
13. **Commercialisation** — pipeline acquéreurs + pont marketplace/Ubiflow.
14. **Facturation & honoraires** — 3 natures par société, échéancier.
15. **Extranet vendeur** (lecture seule) + **Extranet locataire** (V2, restreint).
16. **Analytics inter-opérations** — durée moyenne, marge, meilleur presta par type, taux de préemption réel (moat cumulatif).

---

## 6. Périmètre MVP vs V2

**MVP (le noyau qui crée de la valeur immédiate) :**
- Couche `operations` au-dessus de `listings`/`listing_lots` + rôles + RLS + dashboard/calendrier/tasks.
- Moteur d'estimation bloc vs découpe (2 modes).
- Grilles de prix avec rapprochement DVF (données déjà chargées → pas de stub).
- Annuaire prestataires + historique prix.
- Emails & demandes de devis (boîte `devis@`, modèles seedés, envoi + réception threadée) + comparateur.
- Générateur propal/contrat/mandat + registre des mandats + bibliothèque de clauses.
- Coffre documentaire (extension `listing_documents` : plans, photos, docs joignables aux devis).

**V2 (tous validés) :**
- Tracker de préemptions à compte à rebours.
- Congés & négociations + journal horodaté.
- Travaux / DCE (pont Greystone Bâtiment).
- Suivi des actes + facturation 3 natures + échéancier.
- Signature Docusign.
- Pont marketplace / Ubiflow (publication des lots prêts à vendre).
- Extranet vendeur, puis extranet locataire (le plus sensible, en dernier).
- Analytics inter-opérations.
- Lien facturation ↔ module tréso de la plateforme CM IA.

---

## 7. Intégrations

### 7.1 Email — deux routes, jamais une seule

Le BO écrit à deux publics très différents, et confondre leurs routes est le
meilleur moyen de griller le domaine. D'où deux chemins distincts, décidés au
seul endroit qui décide (`lancerSalve` dans `lib/bo/mails-actions.ts`).

**Route nominative — le un-à-un.** Estimation au propriétaire, demande de devis
à un prestataire, réponse à un locataire.
- Boîte **dédiée** `devis@`, jamais la boîte FI premium.
- Gmail API : envoi (avec PJ depuis le coffre) + réception, threading rattaché à `operation_id`/`provider_id`.
- Part de l'adresse de l'agent : c'est une conversation, elle doit avoir un visage.

**Route de masse — les salves.** Diffusion d'un dossier à un vivier
d'acquéreurs, projets annexes.
- Relais **SendGrid** en SMTP (`smtp.sendgrid.net`, identifiant littéral `apikey`,
  mot de passe = la clé d'API). Variables `MASSE_SMTP_*`, puis `MASSE_DOMAINE`
  (une adresse par agent) ou `MASSE_FROM` (adresse de service unique).
- Adresse d'expédition sur un **sous-domaine dédié** (`agence.france-immeuble.fr`),
  jamais sur le domaine courant : une campagne qui tourne mal n'entame alors rien
  de la messagerie de tous les jours. Sous-domaine et non domaine cousin —
  un nom de domaine proche de la marque et sans historique est le motif même du
  phishing, c'est lui qui se fait signaler.
  - Nom du sous-domaine : **neutre et durable**. `dossiers.` deviendrait faux le
    jour d'une salve « projets annexes » ; `communication.` est long (il s'affiche
    dans chaque expéditeur, tronqué sur mobile) et sonne publipostage.
    `agence.` reste vrai quoi qu'on envoie — c'est le nom retenu et authentifié
    chez SendGrid, il ne change plus.
  - **Une adresse par agent** sur ce sous-domaine, à sa convention habituelle :
    `r.voci@agence.france-immeuble.fr` (`MASSE_DOMAINE`). Une salve garde un
    visage. Attention à deux illusions : ça ne cloisonne PAS la réputation entre
    agents — les messageries la calculent au niveau du domaine signataire, pas de
    l'adresse ; et chaque adresse doit **exister en renvoi** vers la vraie boîte
    de l'agent, sinon une réponse qui ignore le `Reply-To` part dans le vide.
  - Le **nom affiché** fait l'essentiel : c'est lui que montrent presque tous les
    clients de messagerie, l'adresse ne venant qu'après.
- SPF + DKIM + DMARC publiés sur ce sous-domaine. Sans DKIM aligné, le reste ne
  sert à rien.
- `Reply-To` = l'agent : la réponse lui revient à LUI, quel que soit
  l'expéditeur affiché. C'est ce qui permet à la route de masse de rester
  compatible avec « le commercial gère les retours ».
- `List-Unsubscribe` + `List-Unsubscribe-Post` sur chaque message. Sans eux, le
  bouton « désabonnement » des messageries devient « signaler comme spam ».
- **Plafond du jour : `PLAFOND_JOUR` (4 000 par défaut).** Au-delà de 5 000 par
  jour, Gmail classe l'expéditeur en « masse » et lui impose ses obligations :
  on s'arrête avant, avec une marge. Le compteur s'affiche à l'écran de salve
  et le bouton se ferme quand la salve ferait franchir la ligne.
- Connexion SMTP mutualisée, cadence tenue à 4 messages/seconde. Une rafale de
  connexions se fait limiter aussi sûrement qu'un volume excessif.
- Montée en charge sur un domaine neuf : 20 le premier jour, 50, 100, puis le
  régime normal à partir de la deuxième semaine. C'est le démarrage à froid qui
  se fait signaler, pas le volume.

**Commun aux deux routes :** doctrine héritée du netlinking — **validation
humaine avant tout envoi**. L'app prépare, MAV/agent envoie. Aucun envoi
automatique, jamais.

### 7.2 DVF / loyers
Déjà en base (§4.3). Consommation directe, aucune API externe.

### 7.3 Ubiflow / marketplace
Un `listing_lot` « prêt à vendre » → publication marketplace et/ou flux XML Ubiflow. Réutilise l'architecture flux unique déjà décidée.

### 7.4 Docusign (V2)
Mandats, contrats de mission, protocoles de départ locataire.

---

## 8. Garde-fous (invariants — ne jamais contourner)

### 8.1 Conformité Hoguet
- Le **registre des mandats** est séquentiel, immuable, sans trou. Si l'app génère un mandat, elle **doit** l'inscrire au registre. Numéro non éditable.
- Deux instruments distincts quand la doctrine l'exige (mission de structuration ≠ mandat de vente).
- Pas de perception d'honoraires avant l'acte (art. 6 loi Hoguet).

### 8.2 Doctrine préemption — honoraires charge vendeur
- Sur tout lot susceptible de préemption (locataire loi 75, commercial Pinel), honoraires **charge vendeur** et prix notifié au locataire = **prix net vendeur non majoré**. Jamais de charge acquéreur sur ces lots (jurisprudence constante). Le module grilles/mandats l'impose par défaut.

### 8.3 RGPD locataires (risque n°1)
- **Jamais** de nom de locataire exposé côté public/marketplace : personne morale/physique anonymisée dans `listing_lots` publiées.
- Caviardage obligatoire des baux avant tout partage. Accès dataroom loggé.
- Extranet locataire : accès strictement limité au lot de l'intéressé, messagerie encadrée, aucune donnée d'un autre locataire visible. Fonctionnalité la plus sensible → développée en dernier, revue dédiée.

### 8.4 Cloisonnement cockpit ↔ marketplace
- Les tables et champs internes (`operations`, `owners`, `fi_notes`, leads…) ne franchissent jamais l'API publique marketplace. RLS testée explicitement : un utilisateur public ne doit rien voir des opérations ni des listings non publiés.

### 8.5 France Immeuble reste agent, jamais propriétaire
- L'outil modélise une activité d'entremise. Aucune logique ne laisse entendre que FI porte les lots. Fiscalité vendeur (plus-values, requalification marchand de biens) = signalée aux propriétaires, jamais assumée par FI.

---

## 9. Milestones (validés un par un sur preview Vercel)

- **M1 — Fondations.** Récupérer le DDL réel de `listings`/`listing_lots`. Créer la couche `operations` + tables cockpit MVP, RLS cohérente avec l'existant, auth, rôles. Seed opération 55 rue Volant (rattachée à un `listing`).
- **M2 — Immeubles, lots, baux, coffre.** UI sur `listings`/`listing_lots`, multi-propriétaires, upload documents/plans/photos (extension `listing_documents`), compte à rebours fenêtre de congé.
- **M3 — Estimation & grilles.** Moteur bloc vs découpe (2 modes), grilles libre/occupé, rapprochement DVF (tables déjà chargées), honos charge vendeur imposé.
- **M4 — Prestataires & devis email.** Annuaire + historique prix, boîte `devis@` (Gmail API), modèles seedés, envoi 1-clic + réception threadée, comparateur.
- **M5 — Documents contractuels.** Générateur propal/contrat/mandat, bibliothèque de clauses, registre des mandats séquentiel.
- **M6 — Dashboard & séquencement.** Moteur de phases → tasks/calendrier unifié, rappels, dashboard multi-opérations.

**Puis V2** (nouvelle série) : préemptions → congés/négos → travaux → actes/facturation → Docusign → pont marketplace/Ubiflow → extranet vendeur → extranet locataire → analytics.

---

## 10. Décisions actées

- **Deux routes e-mail, jamais une seule** (§7.1) : le un-à-un part de la boîte dédiée `devis@` via Gmail API, jamais de la boîte FI premium ; la masse part de SendGrid sur un sous-domaine dédié, avec `Reply-To` sur l'agent et un plafond de 4 000 par jour.
- Supabase **« Plein Bail »** (`fkfwucqpdhbkgkouccyi`) mutualisé : bien = `listings`, lots+baux = `listing_lots`, pas de table `properties`. Le cockpit ajoute la couche `operations`.
- Benchmarks DVF/loyers déjà chargés → rapprochement DVF dès le MVP.
- MVP = couche opérations + estimation + grilles + annuaire/devis + documents contractuels ; tout le reste en V2.
- **Extranet vendeur ET extranet locataire** retenus (locataire en dernier, garde-fous §8.3).

## 10 bis. Espace client — décisions actées et reste à faire

> Mis en pause par MAV le 03/09/26, le temps qu'il boucle le parcours client de
> son côté. À reprendre ici, sans redécider ce qui suit.

**Ce qui est tranché et livré.**
- **Un compte par PERSONNE**, rattaché à une fiche `bo_contact`, pas un lien par
  immeuble : « sinon il va pas revenir sur un lien où tout le monde peut aller ».
  Une seule personne porte les deux casquettes — ce qu'elle vend, ce qu'elle
  cherche — et les deux vivent sur la même page.
- **Cloisonnement en base, pas dans le code.** L'espace client porte la clé
  publique (`anon`), qui ne lit aucune table, et n'appelle que les fonctions
  `ec_*` (SECURITY DEFINER, `search_path` fixe, EXECUTE accordé au seul `anon`).
  Chacune exige un jeton de session, le résout elle-même en contact, et ne rend
  que ses lignes. **Ne jamais rebrancher une page cliente sur la clé de
  service** : ce serait défaire tout l'édifice. Seule exception tolérée, l'écriture
  d'un fichier dans le seau (`espace-depot.ts`), autorisée par la base AVANT.
- Piège à retenir : une fonction SQL `returns <composite>` qui ne trouve rien
  rend **une ligne toute nulle**, pas « rien » — d'où `returns setof` sur
  `ec_compte_de_session`. Toute nouvelle garde de session doit passer par elle.
- Mots de passe en **bcrypt calculé dans la base** : l'empreinte ne sort jamais.
  12 caractères minimum, aucune règle de composition. Cinq échecs → blocage 15 min.
- **On ne dit jamais si un compte existe** (connexion comme mot de passe oublié).
  Le lien de réinitialisation part par e-mail, jamais rendu à l'appelant.
- **Rien ne s'auto-crée** : MAV ouvre les comptes, depuis le bien (Description et
  prix) ou depuis la fiche contact. Aucune page d'inscription.
- Côté acquéreur : il remplit lui-même ses critères, et ne voit que ce qu'on lui
  a proposé **ou** ce qui est **en ligne sur Plein Bail** (`pb_url` renseignée) —
  **jamais tous les mandats**.
- Le lien secret sans mot de passe est conservé, mais il s'échange contre une
  session ordinaire : un seul mécanisme d'accès dans toute l'application.

**Ce qui reste pour boucler le parcours de bout en bout.**
1. Variables Vercel : `SITE_URL` (adresse publique du BO, pour le lien « mot de
   passe oublié ») et, si on veut l'expliciter, `SUPABASE_ANON_KEY`.
2. Le mail d'estimation joint encore le **lien secret** ; le basculer sur le lien
   d'**activation de compte**, qui est ce qui fait revenir.
3. Les réponses d'acquéreurs (« intéressé », « visite ») s'écrivent bien mais ne
   s'affichent nulle part dans le BO : `reponsesEnAttente()` existe dans
   `comptes-bo.ts`, il lui manque son écran (fiche bien et/ou Propositions).
4. « Mot de passe oublié » dépend de `envoiPossible()` : à vérifier une fois la
   route d'envoi configurée.
5. `/api/photo?s=<chemin>` sert toujours n'importe quel objet du seau à qui
   connaît le chemin. L'espace client ne s'en sert pas, mais tant que le BO n'a
   pas d'authentification, c'est une porte ouverte à refermer.

## 11. À trancher plus tard (non bloquant pour M1)
- Nom + domaine du produit (conditionne le domaine de la boîte `devis@`).
- Société porteuse (Grey Stone Capital ou entité dédiée).
- Lien facturation ↔ module tréso de la plateforme CM IA.
- Politique de rétention / archivage des opérations closes.

---

## 12. Runbook déploiement Vercel — erreur `404: NOT_FOUND`

> Déjà rencontré plusieurs fois. À lire **avant** de paniquer sur un 404 Vercel.
> Le repo est déployé sur Vercel, **production sur la branche `main`**.

### 12.1 D'abord : distinguer les deux types de 404
- **404 « plateforme Vercel »** = page blanche avec `404: NOT_FOUND`, `Code: NOT_FOUND`
  et un `ID: cdg1::…`. → **Ce n'est PAS un bug du code.** C'est Vercel qui ne
  sert pas l'app (déploiement absent, mauvais domaine, ou mauvais framework).
- **404 Next.js** = la page « This page could not be found » stylée avec la mise
  en page de l'app. → là c'est une **route** manquante côté code.

### 12.2 Test qui tranche (toujours faire ça)
1. Vérifier en local que la route marche : `npm run build && npm run start` puis
   `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → doit être `200`.
   - Si `200` en local mais 404 en ligne → **problème Vercel, pas le code.**
2. Sur Vercel → **Deployments** → ouvrir le déploiement **Production** (Ready) →
   bouton **Visit** (URL propre au déploiement).
   - Page OK sur cette URL mais 404 sur le domaine → **problème de domaine**.
   - 404 **même** sur l'URL du déploiement → **build sert un mauvais output**
     (framework mal détecté / Root Directory).

### 12.3 Les 2 causes déjà vues, et leur fix
**Cause A — la branche de prod est vide.** `main` ne contenait qu'un commit
d'init ; tout le code était sur la branche de dev → prod 404.
- **Fix :** s'assurer que `main` contient l'app (merger la branche de dev dans
  `main`), OU régler Vercel *Settings → Git → Production Branch* sur la bonne branche.

**Cause B — Vercel ne détecte pas Next.js** (le plus fréquent ici). Le
déploiement passe **Ready** mais sert le dossier statique `public/` (sans
`index.html`) → `404: NOT_FOUND` sur **toutes** les routes.
- **Fix durable (déjà en place) :** `vercel.json` à la racine :
  ```json
  { "framework": "nextjs", "buildCommand": "next build", "installCommand": "npm install" }
  ```
  `vercel.json` **prime** sur les réglages du dashboard.
- **Condition :** le `vercel.json` n'est lu que depuis le **Root Directory**. Si
  *Settings → Build & Deployment → Root Directory* pointe sur un sous-dossier, le
  fichier est ignoré → mettre Root Directory **vide** (= racine) puis **Redeploy**.

### 12.4 Prévention (à respecter à chaque nouveau déploiement)
- Garder `vercel.json` (framework=nextjs) à la **racine** du repo.
- **Root Directory Vercel = vide** (racine). Ne jamais pointer un sous-dossier
  tant que l'app Next est à la racine.
- **Production Branch = `main`**, et `main` doit toujours contenir une app
  buildable (ne jamais laisser `main` vide).
- Après un push, attendre que le déploiement Production soit **Ready** avant de
  conclure à un bug ; le 1ᵉʳ 404 vient souvent d'un test **avant** la fin du build.
- Polices : rester sur des **polices système** (pas de `next/font/google`) pour un
  build hermétique, indépendant de l'accès réseau au build.
